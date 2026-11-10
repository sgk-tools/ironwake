"""High-detail original enemies with the same pipeline as the hero (CC0 scans, lames, baked 2K atlas).
grunt: undead soldier in a dented kettle helm, rusted mail and a ragged tabard over dried, gaunt skin.
boss : horned demon knight in blackened plate with spiked lames, glowing seams and a tattered cape.
Also rebuilds the enemy weapons with scanned materials."""
import bpy, bmesh, math, os, random, sys
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from lib import _select, CH
from sword_real import scanned_mat, leather_mat, img_node, _bw
from hero_real import cloth_mat, mail_mat, band, lames, rivets, ring_points, cape
from characters import bake_character


def skin_mat(name, tint=(0.36, 0.34, 0.29)):
    """Dried, desiccated skin: leather scan grain, desaturated and tinted, with darker blotches."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], out.inputs['Surface'])
    v = nt.nodes.new('ShaderNodeTexCoord').outputs['Object']
    g = lerp(nt, 0.4, _bw(nt, img_node(nt, 'brown_leather', 'diff', v, False, 7)), 0.35)
    gc = nt.nodes.new('ShaderNodeCombineColor')
    for i in range(3): nt.links.new(g, gc.inputs[i])
    c = mix(nt, 1.0, gc.outputs[0], (*tint, 1), blend='MULTIPLY')
    blot = ramp(nt, noise(nt, v, 6, 8, 0.6), 0.45, 0.75)
    c = mix(nt, math_(nt, 'MULTIPLY', blot, 0.6), c, (0.05, 0.035, 0.03, 1))
    r = lerp(nt, blot, 0.62, 0.8)
    n = nt.nodes.new('ShaderNodeNormalMap'); n.inputs['Strength'].default_value = 1.4
    nt.links.new(img_node(nt, 'brown_leather', 'nor', v, True, 7), n.inputs['Color'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35
    nt.links.new(math_(nt, 'MULTIPLY', voronoi(nt, v, 30, 'Distance'), 1.0), bump.inputs['Height'])
    nt.links.new(n.outputs[0], bump.inputs['Normal']); nt.links.new(bump.outputs[0], b.inputs['Normal'])
    nt.links.new(c, b.inputs['Base Color']); nt.links.new(r, b.inputs['Roughness'])
    z = lerp(nt, 0.0, 0.0, 0.0); nt.links.new(z, b.inputs['Metallic'])
    CH[m.name] = dict(color=c, rough=r, metal=z, bsdf=b, out=out, emit=None)
    return m


def finish(P, budget):
    for k in list(P):
        if tris(P[k]) > budget:
            P[k] = decimate(P[k], budget / tris(P[k]))
        print(k, tris(P[k]))
    return P


# ------------------------------------------------------------------ grunt
def build_grunt():
    R = scanned_mat('g_rust', ('rusty_metal_02', 'rusty_metal_04', 3.0), mask_range=(0.35, 0.6),
                    tint=(0.2, 0.19, 0.18), desat=True, rust_tint=(0.75, 0.62, 0.5))
    S = skin_mat('g_skin')
    C = cloth_mat('g_rag', (0.16, 0.13, 0.1), double=False)
    L = leather_mat('g_leather')
    ML = mail_mat('g_mail')
    eye = pbr('g_eye', (0.4, 0.05, 0.02), r1=0.3, bstr=0.0, emit=((1.0, 0.2, 0.05), 6.0))
    P = {}
    # pelvis: mail skirt, belt with buckle, front/back tabard flaps
    p = [cyl(0.15, 0.19, 0.27, (0, 0, -0.09), ML, verts=18, scale=(1, 0.75, 1)),
         cyl(0.158, 0.158, 0.045, (0, 0, 0.03), L, verts=18, scale=(1, 0.8, 1)),
         cube((0.05, 0.03, 0.045), (0, -0.13, 0.03), R, bevel=0.008)]
    for y, r in ((-0.125, -8), (0.125, 8)):
        f = cube((0.2, 0.012, 0.36), (0, y, -0.16), C, rot=(math.radians(r), 0, 0), bevel=0.003)
        bm = bmesh.new(); bm.from_mesh(f.data)  # ragged hem
        random.seed(int(y * 100))
        for v in bm.verts:
            if v.co.z < -0.3: v.co.z += random.uniform(0, 0.09)
        bm.to_mesh(f.data); bm.free(); p.append(f)
    P['pelvis'] = join(p, 'pelvis')
    # torso: gaunt skin abdomen with rib ridges, mail shirt, dented rusty breastplate, collar
    t = [cyl(0.125, 0.145, 0.3, (0, 0, 0.12), S, verts=18, scale=(1, 0.72, 1))]
    for i in range(4):
        t.append(torus(0.118 - i * 0.004, 0.007, (0, -0.01, 0.05 + i * 0.04), S, scale=(1, 0.72, 0.5)))
    t += [sphere(0.18, (0, 0.0, 0.31), ML, scale=(1.0, 0.7, 0.95), segs=20, rings=12)]
    bp = sphere(0.185, (0, -0.01, 0.3), R, scale=(0.95, 0.66, 1.0), segs=24, rings=14)
    bm = bmesh.new(); bm.from_mesh(bp.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > -0.02 or v.co.z < 0.17], context='VERTS')
    random.seed(4)
    for v in bm.verts:  # dents
        v.co += v.normal * (-0.006 * max(0, math.sin(v.co.x * 40) * math.cos(v.co.z * 31)))
    bm.to_mesh(bp.data); bm.free()
    so = bp.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.006; bp = apply_all(bp); t.append(bp)
    t += rivets(ring_points(0.165, 0.118, 0.2, 9, math.pi * 1.15, math.pi * 1.85), R, r=0.006)
    t += [cyl(0.05, 0.055, 0.14, (0, 0, 0.47), S, verts=12),
          torus(0.075, 0.018, (0, 0, 0.44), C, scale=(1, 0.85, 1)),
          sphere(0.068, (-0.2, 0, 0.42), S, segs=12, rings=8), sphere(0.068, (0.2, 0, 0.42), S, segs=12, rings=8),
          cube((0.03, 0.18, 0.02), (-0.1, 0, 0.45), L, rot=(0, 0.4, 0), bevel=0.004)]
    P['torso'] = join(t, 'torso')
    # head: gaunt skull face, sunken eyes glowing, kettle helm with brim, rivets and chin strap
    h = [sphere(0.098, (0, 0.0, 0.11), S, scale=(0.9, 1.0, 1.14), segs=22, rings=14),
         sphere(0.055, (0, -0.05, 0.03), S, scale=(1.05, 0.95, 0.75), segs=14, rings=8),
         sphere(0.03, (-0.045, -0.072, 0.12), M_void := pbr('g_void', (0.01, 0.006, 0.005), r1=0.9, bstr=0.0), segs=10, rings=6),
         sphere(0.03, (0.045, -0.072, 0.12), M_void, segs=10, rings=6),
         sphere(0.014, (-0.042, -0.088, 0.12), eye, segs=8, rings=6),
         sphere(0.014, (0.042, -0.088, 0.12), eye, segs=8, rings=6),
         sphere(0.13, (0, 0.0, 0.16), R, scale=(1, 1.05, 0.72), cut=0.05, segs=24, rings=12),
         torus(0.168, 0.012, (0, 0, 0.165), R, scale=(1, 1.02, 1)),
         cyl(0.17, 0.16, 0.012, (0, 0, 0.167), R, verts=24),
         cube((0.012, 0.02, 0.1), (-0.085, -0.02, 0.07), L, bevel=0.002), cube((0.012, 0.02, 0.1), (0.085, -0.02, 0.07), L, bevel=0.002)]
    h += rivets(ring_points(0.126, 0.132, 0.19, 10), R, r=0.006)
    P['head'] = join(h, 'head')
    # arms: skin, rusty spaulder lames, leather bracer with straps, rag wraps
    u = [sphere(0.06, (0, 0, 0), S, segs=14, rings=8), cyl(0.045, 0.04, 0.34, (0, 0, -0.15), S, verts=14)]
    u += lames(0.075, 0.068, 0.05, 0.12, 2, R, flare=0.06, overlap=0.3)
    u += [cyl(0.05, 0.047, 0.07, (0, 0, -0.24), C, verts=14)]
    P['uarm'] = join(u, 'uarm')
    f = [sphere(0.044, (0, 0, 0), S, segs=12, rings=8), cyl(0.04, 0.032, 0.3, (0, 0, -0.13), S, verts=14),
         cyl(0.046, 0.04, 0.12, (0, 0, -0.17), L, verts=14)]
    f += [torus(0.046, 0.005, (0, 0, -0.13), L), torus(0.042, 0.005, (0, 0, -0.21), L)]
    P['farm'] = join(f, 'farm')
    g = [cyl(0.032, 0.035, 0.05, (0, 0, -0.02), S, verts=10), cube((0.058, 0.07, 0.07), (0, 0, -0.07), S, bevel=0.018, subsurf=1)]
    for i in range(4):  # bony fingers
        g.append(cyl(0.009, 0.007, 0.055, (-0.022 + i * 0.015, -0.032, -0.105), S, verts=8, rot=(math.radians(-35), 0, 0)))
    g.append(cyl(0.01, 0.008, 0.045, (0.035, -0.02, -0.07), S, verts=8, rot=(math.radians(-20), math.radians(30), 0)))
    P['hand'] = join(g, 'hand')
    # legs: ragged trousers, rusty knee plate, cloth wraps, wrapped boots
    th = [sphere(0.08, (0, 0, 0), C, segs=12, rings=8), cyl(0.07, 0.085, 0.47, (0, 0, -0.22), C, verts=16)]
    th.append(cube((0.11, 0.015, 0.16), (0, -0.075, -0.15), R, rot=(math.radians(-5), 0, 0), bevel=0.006, subsurf=1))
    P['thigh'] = join(th, 'thigh')
    sh = [sphere(0.06, (0, 0, 0), S, segs=12, rings=8), sphere(0.055, (0, -0.035, 0.0), R, scale=(1.05, 0.7, 1.1), segs=14, rings=8),
          cyl(0.045, 0.06, 0.47, (0, 0, -0.21), S, verts=14)]
    for i in range(6):
        sh.append(cyl(0.063 - i * 0.002, 0.06 - i * 0.002, 0.04, (0, 0, -0.17 - i * 0.035), C, verts=14, rot=(math.radians(6 * (-1) ** i), 0, 0)))
    P['shin'] = join(sh, 'shin')
    ft = [cube((0.09, 0.22, 0.08), (0, -0.05, -0.05), L, bevel=0.025, subsurf=1)]
    for i in range(3):
        ft.append(torus(0.05, 0.006, (0, -0.02 - i * 0.05, -0.05), C, rot=(math.radians(90), 0, 0), scale=(1, 1, 0.8)))
    P['foot'] = join(ft, 'foot')
    return finish(P, 600)


# ------------------------------------------------------------------ boss
def build_boss():
    A = scanned_mat('b_steel', ('rusty_metal_04', 'rusty_metal_04', 2.6), mask_range=(0.7, 0.9),
                    tint=(0.09, 0.08, 0.08), desat=True, rust_tint=(0.45, 0.25, 0.2))
    D = scanned_mat('b_dark', ('rusty_metal_02', 'rusty_metal_04', 3.0), mask_range=(0.75, 0.92),
                    tint=(0.04, 0.035, 0.035), desat=True, rust_tint=(0.35, 0.18, 0.15))
    F = pbr('b_flesh', (0.09, 0.015, 0.012), (0.03, 0.006, 0.006), mscale=5, r1=0.4, r2=0.6, bscale=40, bstr=0.5,
            emit=((0.9, 0.12, 0.02), 1.6),
            height=lambda nt, v: math_(nt, 'MULTIPLY', voronoi(nt, v, 16, 'Distance'), 0.8))
    H = pbr('b_horn', (0.2, 0.17, 0.13), (0.05, 0.04, 0.035), mscale=2, mrange=(0.3, 0.8), r1=0.45, r2=0.7, bscale=40, bstr=0.5,
            stretch=(1, 1, 6), height=lambda nt, v: math_(nt, 'MULTIPLY', wave(nt, v, 30, 4, 'RINGS'), 0.6))
    eye = pbr('b_eye', (0.6, 0.2, 0.05), r1=0.3, bstr=0.0, emit=((1.0, 0.45, 0.08), 12.0))
    L = leather_mat('b_leather')
    ML = mail_mat('b_mail')
    M = {'cape': cloth_mat('b_cape', (0.03, 0.012, 0.012), double=True)}

    def spikes(pts, r=0.022, h=0.1, mat=D):
        out = []
        for (x, y, z), (rx, ry) in pts:
            out.append(cyl(r, 0.0, h, (x, y, z), mat, verts=8, rot=(rx, ry, 0)))
        return out
    P = {}
    p = [cyl(0.18, 0.22, 0.3, (0, 0, -0.1), ML, verts=24, scale=(1, 0.8, 1))]
    p += lames(0.195, 0.22, 0.06, 0.17, 3, A, sy=0.8, edge_mat=D, flare=0.06)
    for sx in (-1, 1):
        for i in range(3):
            p.append(cube((0.17 - i * 0.01, 0.014, 0.095), (sx * 0.095, -0.175 - i * 0.008, -0.12 - i * 0.075), A,
                          rot=(math.radians(-10 - i * 3), 0, math.radians(sx * 10)), bevel=0.006, subsurf=1))
    P['pelvis'] = join(p, 'pelvis')
    t = [cyl(0.15, 0.18, 0.26, (0, 0, 0.1), F, verts=24, scale=(1, 0.75, 1)),
         sphere(0.225, (0, -0.005, 0.32), A, scale=(1.08, 0.72, 1.08), segs=32, rings=18, subsurf=1),
         cube((0.03, 0.07, 0.36), (0, -0.15, 0.31), D, rot=(math.radians(-4), 0, 0), bevel=0.012, subsurf=1)]
    t += lames(0.205, 0.17, 0.2, 0.2, 3, A, sy=0.75, edge_mat=D, flare=-0.02)
    t += lames(0.11, 0.125, 0.57, 0.13, 3, D, sy=0.95, edge_mat=A, flare=0.06)
    t += spikes([((x, -0.17, z), (math.radians(80), 0)) for x, z in ((-0.11, 0.42), (0.11, 0.42), (-0.15, 0.3), (0.15, 0.3), (0, 0.24))])
    t += rivets(ring_points(0.22, 0.15, 0.2, 16, math.pi * 1.1, math.pi * 1.9), D, r=0.008)
    P['torso'] = join(t, 'torso')
    # head: horned great helm with a glowing T-slit, bevor and curved horns
    h = [sphere(0.14, (0, 0.004, 0.15), A, scale=(1.0, 1.1, 1.08), segs=32, rings=20, subsurf=1),
         cube((0.21, 0.07, 0.09), (0, -0.12, 0.06), D, bevel=0.02, subsurf=1),
         cube((0.17, 0.02, 0.012), (0, -0.15, 0.15), eye, bevel=0.0), cube((0.012, 0.02, 0.07), (0, -0.152, 0.11), eye, bevel=0.0),
         torus(0.145, 0.009, (0, 0, 0.17), D, rot=(0, math.radians(90), 0), scale=(1, 1.1, 1.08))]
    h += lames(0.12, 0.13, 0.035, 0.08, 2, A, sy=1.05, edge_mat=D, flare=0.05)
    for sgn in (-1, 1):
        x, z, y, r = sgn * 0.11, 0.22, 0.0, 0.048
        for k in range(8):
            ang = 0.15 + k * 0.22; step = 0.07
            nx, nz, ny = x + sgn * step * math.cos(ang), z + step * math.sin(ang), y - 0.012
            tilt = math.atan2(nx - x, nz - z)
            h.append(cyl(r, r * 0.82, step * 1.35, ((x + nx) / 2, (y + ny) / 2, (z + nz) / 2), H, verts=12, rot=(0, tilt, 0)))
            x, z, y, r = nx, nz, ny, r * 0.82
        h.append(cyl(r, 0.0, 0.07, (x + sgn * 0.005, y - 0.01, z + 0.035), H, verts=10, rot=(0, sgn * 0.2, 0)))
    P['head'] = join(h, 'head')
    # arms: spiked layered pauldrons, flesh under plate, vambraces with spurs
    u = []
    for i in range(4):
        r = 0.15 - i * 0.008
        u.append(sphere(r, (0, 0, 0.02 - i * 0.048), A if i % 2 == 0 else D, scale=(1.1, 1.06, 0.62), cut=-0.15, segs=24, rings=12))
    u += spikes([((math.cos(a) * 0.07, math.sin(a) * 0.07, 0.1), (math.sin(a) * -0.6, math.cos(a) * 0.6)) for a in (0, 2.1, 4.2)], r=0.03, h=0.16)
    u += [cyl(0.06, 0.055, 0.3, (0, 0, -0.15), F, verts=16)]
    u += lames(0.072, 0.066, -0.12, 0.17, 3, A, edge_mat=D, flare=0.04)
    P['uarm'] = join(u, 'uarm')
    f = [sphere(0.072, (0, 0, 0), D, segs=20, rings=12), sphere(0.06, (0, 0.05, -0.005), A, scale=(1.1, 0.35, 1.2), segs=18, rings=10)]
    f += lames(0.064, 0.052, -0.04, 0.25, 2, A, edge_mat=D, flare=0.03, overlap=0.1)
    f += spikes([((0, 0.07, -0.08), (math.radians(-70), 0)), ((0, 0.06, -0.18), (math.radians(-75), 0))], r=0.02, h=0.11)
    P['farm'] = join(f, 'farm')
    g = [cyl(0.055, 0.068, 0.07, (0, 0, -0.025), A, verts=18, bevel=0.003)]
    for i in range(3):
        g.append(cube((0.085, 0.02, 0.032), (0, 0.045, -0.072 - i * 0.024), A, rot=(math.radians(8), 0, 0), bevel=0.005, subsurf=1))
    g.append(cube((0.08, 0.09, 0.085), (0, 0.0, -0.095), L, bevel=0.02, subsurf=1))
    for i in range(4):
        g.append(cube((0.082, 0.022, 0.02), (0, -0.05 - i * 0.004, -0.12 - i * 0.018), D, rot=(math.radians(25 + i * 15), 0, 0), bevel=0.004, subsurf=1))
    P['hand'] = join(g, 'hand')
    th = [cyl(0.085, 0.1, 0.46, (0, 0, -0.21), F, verts=16)]
    th += lames(0.1, 0.085, -0.03, 0.35, 4, A, sy=0.92, edge_mat=D, flare=0.03)
    P['thigh'] = join(th, 'thigh')
    sh = [sphere(0.08, (0, -0.03, 0.0), D, scale=(1, 0.9, 1.1), segs=20, rings=12),
          cyl(0.065, 0.078, 0.34, (0, 0, -0.24), A, verts=22, bevel=0.004, scale=(1, 0.95, 1))]
    sh += spikes([((0, -0.11, 0.0), (math.radians(90), 0))], r=0.025, h=0.12)
    sh += rivets([(0.07, -0.02, -0.12), (-0.07, -0.02, -0.12), (0.072, -0.02, -0.3), (-0.072, -0.02, -0.3)], D, r=0.008)
    P['shin'] = join(sh, 'shin')
    ft = [cube((0.125, 0.27, 0.025), (0, -0.045, -0.085), L, bevel=0.006)]
    for i in range(5):
        ft.append(cube((0.12, 0.055, 0.065 - i * 0.004), (0, 0.02 - i * 0.045, -0.045 - i * 0.004), A, rot=(math.radians(-6 - i * 4), 0, 0), bevel=0.012, subsurf=1))
    ft.append(sphere(0.06, (0, -0.18, -0.06), D, scale=(1, 1.15, 0.55), segs=18, rings=10))
    P['foot'] = join(ft, 'foot')
    P = finish(P, 5500)
    P['cloak'] = cape(M)
    P['cloak'] = decimate(P['cloak'], 0.6)
    return P


# ------------------------------------------------------------------ weapons
def build_weapons():
    import weapons as W
    W.iron_mat = lambda name, **kw: scanned_mat(name, ('rusty_metal_02', 'rusty_metal_04', 3.0), mask_range=(0.3, 0.55),
                                                tint=(0.22, 0.21, 0.2), desat=True, rust_tint=(0.75, 0.62, 0.5))
    objs = [W.grunt_sword(), W.club()]
    W.iron_mat = lambda name, **kw: scanned_mat(name, ('rusty_metal_04', 'rusty_metal_04', 2.0), mask_range=(0.72, 0.9),
                                                tint=(0.07, 0.065, 0.065), desat=True, rust_tint=(0.4, 0.2, 0.16))
    objs.append(W.boss_axe())
    return objs


if __name__ == '__main__':
    from mathutils import Vector
    import hero_real; hero_real.Vector = Vector
    which = sys.argv[1:] or ['grunt', 'boss', 'weapons']
    if 'grunt' in which:
        reset(); P = build_grunt(); print('grunt total', sum(tris(o) for o in P.values()))
        bake_character(P, 'grunt', 2048)
    if 'boss' in which:
        reset(); P = build_boss(); print('boss total', sum(tris(o) for o in P.values()))
        bake_character(P, 'boss', 2048)
    if 'weapons' in which:
        reset(); objs = build_weapons()
        for i, o in enumerate(objs): o.location.x = i * 1.5
        uv_atlas(objs); bake(objs, 1024, 'eweap')
        for o in objs: o.location.x = 0
        export(objs, 'weapons')
