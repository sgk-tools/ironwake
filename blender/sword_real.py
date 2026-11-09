"""Photoreal pass for the original greatsword: dense geometry with edge nicks, CC0 scanned PBR textures
(Poly Haven, CC0) blended procedurally, baked to 2K for the game. Also renders a close-up still."""
import bpy, bmesh, math, os, random, sys
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from lib import _select, CH
from weapons import blade_mesh

CC0 = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'cc0'))


def img_node(nt, tex, chan, vec, noncolor=True, scale=1.0):
    path = os.path.join(CC0, tex, chan + '.jpg')
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        n.image.colorspace_settings.name = 'Non-Color'
    n.projection = 'BOX'; n.projection_blend = 0.25
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale,) * 3
    nt.links.new(vec, mp.inputs[0]); nt.links.new(mp.outputs[0], n.inputs[0])
    return n.outputs['Color']


def scanned_mat(name, layers, mask_scale=2.0, mask_range=(0.55, 0.75), edge_polish=True, tint=(1, 1, 1), extra_height=None, desat=False, rust_tint=(1, 1, 1)):
    """layers: (base_tex, rust_tex, scale). Rust appears in noise-masked patches and in cavities."""
    base, rust, sc = layers
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], out.inputs['Surface'])
    v = nt.nodes.new('ShaderNodeTexCoord').outputs['Object']
    bc = img_node(nt, base, 'diff', v, False, sc); br = img_node(nt, base, 'rough', v, True, sc)
    rc = img_node(nt, rust, 'diff', v, False, sc * 0.7); rr = img_node(nt, rust, 'rough', v, True, sc * 0.7)
    mask = ramp(nt, noise(nt, v, mask_scale, 10, 0.65), *mask_range)
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    cav = ramp(nt, geo.outputs['Pointiness'], 0.44, 0.5, (1, 1, 1, 1), (0, 0, 0, 1))  # crevices rust first
    mask = math_(nt, 'MAXIMUM', mask, math_(nt, 'MULTIPLY', cav, 0.8))
    if desat:  # turn the scan into dark forged iron: keep its scratches and tonal breakup, drop the colour
        g = lerp(nt, 0.3, _bw(nt, bc), 0.42); gc = nt.nodes.new('ShaderNodeCombineColor')
        for i in range(3): nt.links.new(g, gc.inputs[i])
        bc = gc.outputs[0]
    bc = mix(nt, 1.0, bc, (*tint, 1), blend='MULTIPLY')
    rc = mix(nt, 1.0, rc, (*rust_tint, 1), blend='MULTIPLY')
    col = mix(nt, mask, bc, rc)
    rough = lerp(nt, mask, math_(nt, 'MAXIMUM', math_(nt, 'ADD', _bw(nt, br), 0.05), 0.3), _bw(nt, rr))
    metal = lerp(nt, mask, 0.92, 0.1)
    if edge_polish:  # worn bright steel on sharp convex edges
        e = ramp(nt, geo.outputs['Pointiness'], 0.54, 0.6)
        e = math_(nt, 'MULTIPLY', e, ramp(nt, noise(nt, v, 25, 3, 0.6), 0.3, 0.6), clamp=True)
        col = mix(nt, e, col, (0.55, 0.54, 0.52, 1)); rough = lerp(nt, e, rough, 0.22); metal = lerp(nt, e, metal, 1.0)
    # normals: scanned normal maps for both layers, blended, plus extra bump detail
    nb = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(img_node(nt, base, 'nor', v, True, sc), nb.inputs['Color'])
    nr = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(img_node(nt, rust, 'nor', v, True, sc * 0.7), nr.inputs['Color'])
    nm = mix(nt, mask, nb.outputs[0], nr.outputs[0], kind='VECTOR')
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; bump.inputs['Distance'].default_value = 0.004
    h = noise(nt, v, 90, 8, 0.7)
    if extra_height:
        h = math_(nt, 'ADD', h, extra_height(nt, v))
    nt.links.new(h, bump.inputs['Height']); nt.links.new(nm, bump.inputs['Normal'])
    nt.links.new(bump.outputs[0], b.inputs['Normal'])
    nt.links.new(col, b.inputs['Base Color']); nt.links.new(rough, b.inputs['Roughness']); nt.links.new(metal, b.inputs['Metallic'])
    CH[m.name] = dict(color=col, rough=rough, metal=metal, bsdf=b, out=out, emit=None)
    return m


def leather_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], out.inputs['Surface'])
    v = nt.nodes.new('ShaderNodeTexCoord').outputs['Object']
    c = img_node(nt, 'brown_leather', 'diff', v, False, 6)
    c = mix(nt, 1.0, c, (0.22, 0.17, 0.14, 1), blend='MULTIPLY')  # darkened, sweat-stained
    r = _bw(nt, img_node(nt, 'brown_leather', 'rough', v, True, 6))
    n = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(img_node(nt, 'brown_leather', 'nor', v, True, 6), n.inputs['Color'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.6
    nt.links.new(math_(nt, 'MULTIPLY', wave(nt, v, 22, 1.5), 1.0), bump.inputs['Height']); nt.links.new(n.outputs[0], bump.inputs['Normal'])
    nt.links.new(bump.outputs[0], b.inputs['Normal'])
    nt.links.new(c, b.inputs['Base Color']); nt.links.new(r, b.inputs['Roughness'])
    zero = lerp(nt, 0.0, 0.0, 0.0)
    nt.links.new(zero, b.inputs['Metallic'])
    CH[m.name] = dict(color=c, rough=r, metal=zero, bsdf=b, out=out, emit=None)
    return m


def _bw(nt, col):
    n = nt.nodes.new('ShaderNodeRGBToBW'); nt.links.new(col, n.inputs[0]); return n.outputs[0]


def nicked_outline(pts, step=0.012, seed=3):
    """Resample a polygon densely and cut random battle nicks into the cutting edges."""
    random.seed(seed)
    out = []
    n = len(pts)
    for i in range(n):
        (x0, z0), (x1, z1) = pts[i], pts[(i + 1) % n]
        L = math.hypot(x1 - x0, z1 - z0); k = max(1, int(L / step))
        nx, nz = (z1 - z0) / L, -(x1 - x0) / L  # inward normal for a CCW polygon is -outward
        edge = abs(x1 - x0) < 1e-6 and L > 0.5  # long straight sides are the cutting edges
        nick, nick_len = 0, 0
        for j in range(k):
            t = j / k
            x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
            d = 0.0
            if edge and z > 0.5:
                if nick_len <= 0 and random.random() < 0.035:
                    nick_len = random.randint(2, 5); nick = random.uniform(0.004, 0.014)
                if nick_len > 0:
                    d = nick; nick_len -= 1
                d += random.uniform(0, 0.0015)
            out.append((x - nx * d, z - nz * d))
    return out


def cord_wrap(z0, z1, r, thick, turns, phase=0.0):
    """Helical cord wrap around the grip (two interleaved strands make a cross-wrapped look)."""
    from hero_real import cloth_mat
    mat = bpy.data.materials.get('rs_cord') or cloth_mat('rs_cord', (0.62, 0.56, 0.46), double=False)
    mat.name = 'rs_cord'
    cu = bpy.data.curves.new('cord', 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = thick; cu.bevel_resolution = 3
    sp = cu.splines.new('POLY'); n = turns * 16
    sp.points.add(n - 1)
    for i in range(n):
        t = i / (n - 1); a = phase + t * turns * 2 * math.pi
        sp.points[i].co = (math.cos(a) * r, math.sin(a) * r, z0 + (z1 - z0) * t, 1)
    o = bpy.data.objects.new('cord', cu); bpy.context.collection.objects.link(o)
    o = apply_all(o)
    o.data.materials.clear(); o.data.materials.append(mat)
    _select([o]); bpy.ops.object.shade_smooth()
    return o


def build():
    reset()
    iron = scanned_mat('rs_iron', ('rusty_metal_04', 'rusty_metal_04', 1.1), mask_range=(0.66, 0.86),
                       tint=(0.27, 0.26, 0.25), desat=True, rust_tint=(0.6, 0.55, 0.5))
    plate = scanned_mat('rs_plate', ('rusty_metal_04', 'rusty_metal_04', 2.5), mask_range=(0.55, 0.8), edge_polish=False,
                        tint=(0.13, 0.125, 0.12), desat=True, rust_tint=(0.5, 0.45, 0.4))
    leather = leather_mat('rs_leather')
    W = 0.155
    outline = [(-W, 0.0), (W, 0.0), (W, 1.96), (-W, 1.66), (-W, 0.46), (-W + 0.055, 0.40), (-W + 0.055, 0.30), (-W, 0.24)]
    blade = blade_mesh('blade', nicked_outline(outline), 0.024, 0.045)
    blade.data.materials.append(iron)
    bv = blade.modifiers.new('bv', 'BEVEL'); bv.width = 0.0015; bv.segments = 2; bv.limit_method = 'ANGLE'
    blade = apply_all(blade)
    _select([blade]); bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
    parts = [blade]
    for s in (-1, 1):
        parts.append(cube((0.25, 0.012, 0.2), (0.0, s * 0.026, 0.11), plate, bevel=0.004))
        for (x, z) in ((-0.08, 0.05), (0.08, 0.05), (-0.08, 0.17), (0.08, 0.17)):
            parts.append(sphere(0.014, (x, s * 0.033, z), plate, scale=(1, 0.6, 1), segs=16, rings=8))
    parts.append(cube((0.13, 0.085, 0.07), (0, 0, -0.035), plate, bevel=0.01))
    for s in (-1, 1):
        parts.append(cube((0.17, 0.06, 0.05), (s * 0.13, 0, -0.055), plate, rot=(0, s * math.radians(18), 0), bevel=0.008))
    parts.append(cyl(0.024, 0.022, 0.46, (0, 0, -0.30), leather, verts=24))
    parts.append(cord_wrap(-0.075, -0.525, 0.0275, 0.0062, 19))
    parts.append(cord_wrap(-0.08, -0.52, 0.0275, 0.0062, 19, phase=math.pi))
    parts.append(cyl(0.032, 0.03, 0.05, (0, 0, -0.55), plate, verts=20, bevel=0.005))
    parts.append(torus(0.055, 0.016, (0, 0, -0.63), plate, rot=(math.radians(90), 0, 0)))
    sw = join(parts, 'sword')
    for v in sw.data.vertices:
        v.co.z += 0.16
    return sw


def still(path):
    """Close-up product shot of the sword on dark stone under a warm key light."""
    sc = bpy.context.scene
    sw = bpy.data.objects['sword']
    sw.rotation_euler = (math.radians(90), 0, math.radians(112)); sw.location = (-0.45, -0.3, 0.026)
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
    g = bpy.context.active_object
    gm = scanned_mat('floor', ('rusty_metal_04', 'rusty_metal_04', 0.5), mask_range=(0.9, 1.0), edge_polish=False, tint=(0.05, 0.045, 0.042), desat=True)
    g.data.materials.append(gm)
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    wt = w.node_tree; env = wt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(os.path.join(OUT, 'sky.jpg'))
    wt.links.new(env.outputs[0], wt.nodes['Background'].inputs['Color'])
    wt.nodes['Background'].inputs['Strength'].default_value = 0.35
    for name, loc, rot, energy, col, size in (
            ('key', (-0.6, -1.4, 1.8), (math.radians(38), 0, math.radians(-20)), 900, (1.0, 0.82, 0.68), 1.6),
            ('rim', (1.4, 1.2, 0.7), (math.radians(-68), 0, math.radians(135)), 900, (1.0, 0.5, 0.3), 0.8),
            ('top', (0.4, 0.0, 2.4), (0, 0, 0), 500, (0.85, 0.88, 1.0), 2.5)):
        L = bpy.data.lights.new(name, 'AREA'); L.energy = energy; L.color = col; L.size = size
        o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); o.location = loc; o.rotation_euler = rot
    cam = bpy.data.cameras.new('cam'); cam.lens = 42; cam.dof.use_dof = True; cam.dof.aperture_fstop = 4.0
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    co.location = (0.1, -1.95, 1.05)
    tgt = Vector((0.45, 0.1, 0.0))
    co.rotation_euler = (tgt - co.location).to_track_quat('-Z', 'Y').to_euler()
    f = bpy.data.objects.new('f', None); sc.collection.objects.link(f); f.location = (0.3, 0.0, 0.03); cam.dof.focus_object = f
    sc.cycles.samples = int(os.environ.get('SAMPLES', 128)); sc.cycles.use_denoising = True
    sc.render.resolution_x = 1600; sc.render.resolution_y = 900
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - High Contrast'; sc.view_settings.exposure = -0.4
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 90
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    from mathutils import Vector
    import builtins; builtins.Vector = Vector
    globals()['Vector'] = Vector
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    sw = build()
    uv_atlas([sw], margin=0.003)
    if mode in ('still', 'all'):
        still(os.path.join(OUT, 'sword_still.jpg'))
    if mode in ('bake', 'all'):
        sw.rotation_euler = (0, 0, 0); sw.location = (0, 0, 0)
        for o in list(bpy.data.objects):
            if o is not sw:
                o.hide_render = True
        bake([sw], 2048, 'sword', ao_samples=64, ao_strength=0.5)
        export([sw], 'sword')
