"""High-detail original hero (design A): layered plate armour of overlapping lames, closed helm with a narrow
visor slit, cloth-simulated black cape. Same joint layout as the game rig; textures from CC0 scans, 2K atlas."""
import bpy, bmesh, math, os, random, sys
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from lib import _select, CH
from sword_real import scanned_mat, leather_mat, img_node, _bw
from characters import SKELETON, world_pos


# ------------------------------------------------------------------ materials
def mats():
    M = {}
    M['steel'] = scanned_mat('hr_steel', ('rusty_metal_04', 'rusty_metal_04', 3.0), mask_range=(0.7, 0.9),
                             tint=(0.12, 0.118, 0.122), desat=True, rust_tint=(0.4, 0.36, 0.32))
    M['dark'] = scanned_mat('hr_dark', ('rusty_metal_02', 'rusty_metal_04', 3.5), mask_range=(0.72, 0.92),
                            tint=(0.055, 0.053, 0.056), desat=True, rust_tint=(0.35, 0.3, 0.27))
    M['leather'] = leather_mat('hr_leather')
    M['mail'] = mail_mat('hr_mail')
    M['cloth'] = cloth_mat('hr_cloth', (0.035, 0.033, 0.034), double=False)
    M['cape'] = cloth_mat('hr_cape', (0.022, 0.021, 0.022), double=True)
    M['void'] = pbr('hr_void', (0.003, 0.003, 0.003), r1=0.9, bstr=0.0)
    return M


def cloth_mat(name, tint, double):
    m = bpy.data.materials.new(name); m.use_nodes = True; m.use_backface_culling = not double
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], out.inputs['Surface'])
    v = nt.nodes.new('ShaderNodeTexCoord').outputs['Object']
    g = _bw(nt, img_node(nt, 'hessian_230', 'diff', v, False, 9))
    dirt = ramp(nt, noise(nt, v, 3, 8, 0.6), 0.45, 0.8)
    gc = nt.nodes.new('ShaderNodeCombineColor')
    for i in range(3): nt.links.new(g, gc.inputs[i])
    c = mix(nt, 1.0, gc.outputs[0], (*tint, 1), blend='MULTIPLY')
    c = mix(nt, 1.0, c, mix(nt, dirt, (1, 1, 1, 1), (1.6, 1.25, 1.0, 1)), blend='MULTIPLY')  # dust / dried mud
    r = lerp(nt, 0.0, 0.92, 0.92)
    n = nt.nodes.new('ShaderNodeNormalMap'); n.inputs['Strength'].default_value = 1.5
    nt.links.new(img_node(nt, 'hessian_230', 'nor', v, True, 9), n.inputs['Color'])
    nt.links.new(n.outputs[0], b.inputs['Normal'])
    nt.links.new(c, b.inputs['Base Color']); nt.links.new(r, b.inputs['Roughness'])
    z = lerp(nt, 0.0, 0.0, 0.0); nt.links.new(z, b.inputs['Metallic'])
    try: b.inputs['Sheen Weight'].default_value = 0.4
    except KeyError: pass
    CH[m.name] = dict(color=c, rough=r, metal=z, bsdf=b, out=out, emit=None)
    return m


def mail_mat(name):
    def rings(nt, v):
        return math_(nt, 'MULTIPLY', voronoi(nt, v, 260, 'Distance'), 1.2)
    return pbr(name, (0.05, 0.048, 0.047), (0.11, 0.06, 0.035), mscale=4, mrange=(0.6, 0.85), r1=0.45, r2=0.85,
               m1=1.0, m2=0.3, bscale=260, bstr=0.6, height=rings)


# ------------------------------------------------------------------ shape helpers
def band(r_top, r_bot, z_top, h, mat, sx=1.0, sy=1.0, verts=28, roll=True, dz_front=0.0, edge_mat=None):
    """One armour lame: a tapered elliptical ring with a rolled lower edge."""
    parts = [cyl(r_bot, r_top, h, (0, 0, z_top - h / 2), mat, verts=verts, scale=(sx, sy, 1))]
    me = parts[0].data
    m = parts[0].modifiers.new('so', 'SOLIDIFY'); m.thickness = 0.006; m.offset = 1
    parts[0] = apply_all(parts[0])
    if roll:
        parts.append(torus(r_bot * 1.0, 0.0055, (0, 0, z_top - h), edge_mat or mat, scale=(sx, sy, 1)))
    if dz_front:  # dip the front edge (shapes lames to the body)
        for o in parts:
            for v in o.data.vertices:
                if v.co.y < 0:
                    v.co.z += dz_front * (-v.co.y / (r_bot * sy + 1e-6))
    return parts


def lames(r0, r1, z0, length, n, mat, sx=1.0, sy=1.0, overlap=0.25, edge_mat=None, flare=0.04, dz_front=0.0):
    """Stack of n overlapping lames from z0 downwards, radius r0 -> r1."""
    out = []
    h = length / (n - overlap * (n - 1))
    for i in range(n):
        t0 = i / n
        zt = z0 - i * h * (1 - overlap)
        rt = r0 + (r1 - r0) * t0
        out += band(rt, rt * (1 + flare), zt, h, mat, sx, sy, roll=True, edge_mat=edge_mat, dz_front=dz_front)
    return out


def rivets(points, mat, r=0.0065):
    return [sphere(r, p, mat, scale=(1, 1, 0.7), segs=10, rings=6) for p in points]


def ring_points(rx, ry, z, n, a0=0, a1=2 * math.pi):
    return [(math.cos(a0 + (a1 - a0) * i / n) * rx, math.sin(a0 + (a1 - a0) * i / n) * ry, z) for i in range(n)]


# ------------------------------------------------------------------ parts
def build(M):
    S, D, L, ML, C = M['steel'], M['dark'], M['leather'], M['mail'], M['cloth']
    P = {}
    # pelvis: mail skirt, faulds (3 lames), two front tassets of 3 lames each, belt
    p = [cyl(0.165, 0.205, 0.3, (0, 0, -0.1), ML, verts=28, scale=(1, 0.78, 1))]
    p += lames(0.178, 0.2, 0.06, 0.16, 3, S, sy=0.78, edge_mat=D, flare=0.05)
    p += [cyl(0.181, 0.181, 0.045, (0, 0, 0.055), L, verts=28, scale=(1, 0.8, 1)),
          cube((0.06, 0.035, 0.05), (0, -0.15, 0.055), D, bevel=0.01)]
    for sx in (-1, 1):
        for i in range(3):
            p.append(cube((0.15 - i * 0.008, 0.012, 0.085), (sx * 0.085, -0.155 - i * 0.008, -0.11 - i * 0.065), S,
                          rot=(math.radians(-10 - i * 3), 0, math.radians(sx * 9)), bevel=0.006, subsurf=1))
        p += rivets([(sx * 0.085, -0.17, -0.07)], D)
    P['pelvis'] = join(p, 'pelvis')

    # torso: breastplate with medial ridge, plackart lames, backplate, gorget lames, strap
    t = [cyl(0.15, 0.17, 0.26, (0, 0, 0.11), ML, verts=28, scale=(1, 0.74, 1)),
         sphere(0.205, (0, -0.005, 0.31), S, scale=(1.0, 0.68, 1.12), segs=36, rings=22, subsurf=1),
         cube((0.022, 0.06, 0.34), (0, -0.13, 0.3), S, rot=(math.radians(-4), 0, 0), bevel=0.01, subsurf=2)]
    t += lames(0.19, 0.16, 0.2, 0.18, 3, S, sy=0.72, edge_mat=D, flare=-0.02)
    t += lames(0.105, 0.115, 0.56, 0.12, 3, S, sy=0.95, edge_mat=D, flare=0.06)
    t += rivets(ring_points(0.2, 0.135, 0.2, 14, math.pi * 1.1, math.pi * 1.9), D)
    t += [cube((0.42, 0.04, 0.045), (0, 0.12, 0.47), L, bevel=0.01),
          cube((0.05, 0.03, 0.05), (-0.2, 0.12, 0.47), D, bevel=0.006), cube((0.05, 0.03, 0.05), (0.2, 0.12, 0.47), D, bevel=0.006)]
    P['torso'] = join(t, 'torso')

    # head: closed helm (skull, visor shell with narrow slit, ridge, rivets) + bevor
    h = [sphere(0.128, (0, 0.004, 0.145), S, scale=(0.95, 1.06, 1.08), segs=40, rings=26, subsurf=1)]
    vis = sphere(0.133, (0, -0.004, 0.13), D, scale=(0.97, 1.08, 1.0), segs=40, rings=24, cut=None)
    bm = bmesh.new(); bm.from_mesh(vis.data)  # keep only the front half as a visor shell
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > -0.035 or v.co.z > 0.24 or v.co.z < 0.03], context='VERTS')
    bm.to_mesh(vis.data); bm.free()
    vm = vis.modifiers.new('so', 'SOLIDIFY'); vm.thickness = 0.005; vis = apply_all(vis)
    h.append(vis)
    h.append(cube((0.17, 0.03, 0.011), (0, -0.142, 0.15), M['void'], bevel=0.0))  # eye slit
    for i in range(6):  # breaths
        h.append(cube((0.006, 0.03, 0.03), (-0.04 + i * 0.016, -0.137, 0.085), M['void'], bevel=0.0))
    h.append(torus(0.135, 0.008, (0, 0.0, 0.17), D, rot=(0, math.radians(90), 0), scale=(1, 1.08, 1.1)))  # comb
    h += rivets([(0.122, -0.005, 0.135), (-0.122, -0.005, 0.135)], D, r=0.012)
    h += lames(0.11, 0.12, 0.035, 0.08, 2, S, sy=1.02, edge_mat=D, flare=0.05)
    h += rivets(ring_points(0.122, 0.135, 0.065, 16), D, r=0.005)
    P['head'] = join(h, 'head')

    # upper arm: pauldron of 4 stacked dome lames + rerebrace lames
    u = []
    for i in range(4):
        r = 0.135 - i * 0.008
        d = sphere(r, (0, 0, 0.02 - i * 0.045), S if i % 2 == 0 else S, scale=(1.08, 1.05, 0.62), cut=-0.15, segs=28, rings=14)
        u.append(d); u.append(torus(r * 1.06, 0.005, (0, 0, 0.02 - i * 0.045 - r * 0.62 * 0.15), D, scale=(1.08, 1.05, 1)))
    u += [cyl(0.055, 0.05, 0.3, (0, 0, -0.15), C, verts=16)]
    u += lames(0.066, 0.06, -0.12, 0.17, 3, S, edge_mat=D, flare=0.04)
    P['uarm'] = join(u, 'uarm')

    # forearm: couter with fan + vambrace
    f = [sphere(0.066, (0, 0, 0), S, scale=(1, 1, 0.92), segs=24, rings=14),
         sphere(0.055, (0, 0.05, -0.005), D, scale=(1.1, 0.35, 1.2), segs=20, rings=10)]
    f += lames(0.058, 0.048, -0.04, 0.24, 2, S, edge_mat=D, flare=0.03, overlap=0.1)
    f += rivets(ring_points(0.06, 0.06, -0.05, 6), D)
    P['farm'] = join(f, 'farm')

    # gauntlet: flared cuff, back-of-hand lames, finger lames, leather palm
    g = [cyl(0.05, 0.062, 0.07, (0, 0, -0.025), S, verts=20, bevel=0.003)]
    for i in range(3):
        g.append(cube((0.078, 0.018, 0.03), (0, 0.04 - i * 0.003, -0.07 - i * 0.022), S, rot=(math.radians(8), 0, 0), bevel=0.005, subsurf=1))
    g.append(cube((0.07, 0.08, 0.075), (0, 0.0, -0.09), L, bevel=0.02, subsurf=1))
    for i in range(4):
        g.append(cube((0.074, 0.02, 0.018), (0, -0.045 - i * 0.004, -0.11 - i * 0.017), S, rot=(math.radians(25 + i * 15), 0, 0), bevel=0.004, subsurf=1))
    g.append(sphere(0.022, (0.04, -0.03, -0.075), S, scale=(1, 1, 1.4), segs=12, rings=8))
    P['hand'] = join(g, 'hand')

    # thigh: cuisse lames over padded cloth
    th = [cyl(0.078, 0.092, 0.46, (0, 0, -0.21), C, verts=18)]
    th += lames(0.092, 0.078, -0.03, 0.34, 4, S, sy=0.92, edge_mat=D, flare=0.03)
    P['thigh'] = join(th, 'thigh')

    # shin: poleyn with side wing + greave + rivets
    sh = [sphere(0.072, (0, -0.03, 0.0), S, scale=(1, 0.9, 1.1), segs=24, rings=14),
          sphere(0.05, (0, -0.07, 0.0), D, scale=(1.2, 0.4, 1.0), segs=20, rings=10),
          sphere(0.05, (0, -0.06, 0.06), S, scale=(1.1, 0.6, 0.5), segs=20, rings=10),
          sphere(0.05, (0, -0.06, -0.06), S, scale=(1.1, 0.6, 0.5), segs=20, rings=10)]
    sh += lames(0.055, 0.07, -0.08, 0.32, 1, S, sy=0.95, edge_mat=D, flare=0.0)
    sh += [cyl(0.06, 0.068, 0.32, (0, 0, -0.24), S, verts=24, bevel=0.004, scale=(1, 0.95, 1))]
    sh += rivets([(0.06, -0.02, -0.12), (-0.06, -0.02, -0.12), (0.062, -0.02, -0.3), (-0.062, -0.02, -0.3)], D)
    sh.append(cyl(0.064, 0.064, 0.04, (0, 0, -0.39), L, verts=20))
    P['shin'] = join(sh, 'shin')

    # sabaton: overlapping foot lames + toe cap + sole
    ft = [cube((0.11, 0.25, 0.022), (0, -0.04, -0.082), L, bevel=0.006)]
    for i in range(5):
        ft.append(cube((0.105, 0.05, 0.06 - i * 0.004), (0, 0.02 - i * 0.04, -0.045 - i * 0.004), S, rot=(math.radians(-6 - i * 4), 0, 0), bevel=0.012, subsurf=1))
    ft.append(sphere(0.055, (0, -0.16, -0.06), S, scale=(1, 1.1, 0.55), segs=20, rings=10))
    P['foot'] = join(ft, 'foot')
    for k in list(P):
        if tris(P[k]) > 5000:
            P[k] = decimate(P[k], 0.5)
        print(k, tris(P[k]))
    return P


# ------------------------------------------------------------------ cape (cloth simulation)
def cape(M):
    """Drape a grid over a collision proxy of the rest-pose body, then tatter the hem."""
    sc = bpy.context.scene
    base = world_pos('cloak')  # attach point (Blender coords)
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=40, y_subdivisions=64, size=1)
    ck = bpy.context.active_object; ck.name = 'cloak'
    for v in ck.data.vertices:
        u, t = v.co.x + 0.5, v.co.y + 0.5
        # start wrapped around the shoulders (an arc behind the neck) and widening toward the hem
        a = (u - 0.5) * (2.3 - (1 - t) * 0.9)
        rad = 0.2 + (1 - t) * 0.12
        v.co = Vector((base[0] + math.sin(a) * rad * 1.35, base[1] - 0.08 + math.cos(a) * rad, base[2] - (1 - t) * 1.25))
    pin = ck.vertex_groups.new(name='pin')
    pin.add([v.index for v in ck.data.vertices if v.co.z > base[2] - 0.025], 1.0, 'REPLACE')
    bpy.ops.object.effector_add(type='WIND', location=(base[0] - 1.0, base[1] - 2.0, base[2] - 0.6), rotation=(math.radians(-80), 0, math.radians(-25)))
    wind = bpy.context.active_object
    wind.field.strength = 18; wind.field.noise = 2.0; wind.field.flow = 0.5
    cm = ck.modifiers.new('cloth', 'CLOTH')
    cm.settings.vertex_group_mass = 'pin'
    cm.settings.quality = 8; cm.settings.mass = 0.4; cm.settings.tension_stiffness = 25; cm.settings.bending_stiffness = 2.5
    cm.settings.air_damping = 2
    cm.collision_settings.use_self_collision = False; cm.collision_settings.distance_min = 0.008
    # collision proxies for torso, shoulders and hips
    prox = []
    for loc, sc_ in ((world_pos('torso'), (0.21, 0.16, 0.34)), (world_pos('pelvis'), (0.21, 0.17, 0.2))):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(loc[0], loc[1], loc[2] + (0.28 if sc_[2] > 0.3 else -0.05)))
        o = bpy.context.active_object; o.scale = sc_; o.modifiers.new('c', 'COLLISION'); prox.append(o)
    for s in ('R', 'L'):
        p = world_pos('uarm' + s)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.13, location=p); o = bpy.context.active_object
        o.modifiers.new('c', 'COLLISION'); prox.append(o)
    sc.frame_start = 1; sc.frame_end = 70
    for f in range(1, 71):
        sc.frame_set(f)
    _select([ck]); bpy.context.view_layer.objects.active = ck
    bpy.ops.object.modifier_apply(modifier='cloth')
    for o in prox + [wind]:
        bpy.data.objects.remove(o)
    random.seed(9)
    bm = bmesh.new(); bm.from_mesh(ck.data)
    zmin = min(v.co.z for v in bm.verts)
    kill = []
    for f_ in bm.faces:
        c = f_.calc_center_median()
        depth = (c.z - zmin)
        if depth < 0.3:
            n = 0.5 + math.sin(c.x * 23) * 0.35 + math.sin(c.x * 61 + 2) * 0.25 + math.sin(c.x * 140) * 0.12
            if n > depth * 3.0 + 0.15:
                kill.append(f_)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(ck.data); bm.free()
    ck.vertex_groups.clear()
    so = ck.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.006
    ck.data.materials.append(M['cape'])
    ck = apply_all(ck)
    _select([ck]); bpy.ops.object.shade_smooth()
    # move to joint-local space (origin at the cloak joint)
    for v in ck.data.vertices:
        v.co -= Vector(base)
    return ck


if __name__ == '__main__':
    from mathutils import Vector
    globals()['Vector'] = Vector
    reset()
    M = mats()
    P = build(M)
    P['cloak'] = cape(M)
    print('total tris', sum(tris(o) for o in P.values()))
    from characters import bake_character
    bake_character(P, 'hero', int(os.environ.get('TEX', 2048)))
