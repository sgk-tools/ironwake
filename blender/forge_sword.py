"""'炉心の大剣' (Forge-core greatsword) - an original IRONWAKE weapon.

Design (original): a single-edged, very broad and thick cleaver-like blade. The back is a thick flat spine;
the cutting side swells slightly toward a diagonally clipped tip. Each face is split into a black forge-scale
flat (spine side) and a wide ground bevel (edge side) that are separate mesh faces with separate materials.
Guard: a round 'forge core' collar with vent slots and a faint ember glow. Pommel: tapered octagonal ingot.
Grip: dirty unbleached cloth ribbon wound with overlaps, a knotted start and a hanging tail.

Textures: Poly Haven CC0 scans (rusty_metal_04, metal_plate_02, hessian_230) + procedural layers.
Outputs: assets/sword_forge.glb (game asset, 2K baked atlas) and renders/forge_*.jpg (review images).
"""
import bpy, bmesh, math, os, random, sys
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector
from lib import *
from lib import _select, CH
from sword_real import img_node, _bw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


# ------------------------------------------------------------------ materials
def _mk(name, double=False):
    m = bpy.data.materials.new(name); m.use_nodes = True; m.use_backface_culling = not double
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], out.inputs['Surface'])
    return m, nt, b, out


def _gray(nt, f):
    c = nt.nodes.new('ShaderNodeCombineColor')
    for i in range(3): nt.links.new(f, c.inputs[i])
    return c.outputs[0]


def _streaks(nt, v, scale=70.0, along=1.2):
    """Fine grinding scratches running along the blade (object Z)."""
    mp = nt.nodes.new('ShaderNodeMapping'); nt.links.new(v, mp.inputs[0])
    mp.inputs['Scale'].default_value = (scale, scale, along)
    return noise(nt, mp.outputs[0], 1.0, 4, 0.55)


def _dents(nt, v):
    """Sparse local hammer dents: small voronoi cells kept only where a coarse noise allows."""
    d = voronoi(nt, v, 26, 'Distance')
    pit = ramp(nt, d, 0.0, 0.14, (1, 1, 1, 1), (0, 0, 0, 1))
    keep = ramp(nt, noise(nt, v, 4, 2, 0.5), 0.6, 0.66)
    return math_(nt, 'MULTIPLY', _bw_f(nt, pit), _bw_f(nt, keep))


def _bw_f(nt, col):
    n = nt.nodes.new('ShaderNodeRGBToBW'); nt.links.new(col, n.inputs[0]); return n.outputs[0]


def scale_mat():
    """Black forge scale on the flat: uneven blotchy scale, fine streaks, rare dents, faint rust in pits."""
    m, nt, b, out = _mk('fs_scale')
    v = nt.nodes.new('ShaderNodeTexCoord').outputs['Object']
    scan = _bw(nt, img_node(nt, 'rusty_metal_04', 'diff', v, False, 1.6))
    blot = ramp(nt, noise(nt, v, 2.2, 6, 0.6), 0.35, 0.75)                 # large colour unevenness of the scale
    tone = lerp(nt, blot, 0.01, 0.028)
    tone = math_(nt, 'MULTIPLY', tone, lerp(nt, 0.5, scan, 1.0))
    st = _streaks(nt, v)
    tone = math_(nt, 'ADD', tone, math_(nt, 'MULTIPLY', ramp(nt, st, 0.62, 0.7), 0.025))
    dents = _dents(nt, v)
    col = mix(nt, math_(nt, 'MULTIPLY', dents, 0.6), _gray(nt, tone), (0.09, 0.05, 0.03, 1))
    rough = lerp(nt, blot, 0.72, 0.9)
    rough = math_(nt, 'SUBTRACT', rough, math_(nt, 'MULTIPLY', ramp(nt, st, 0.6, 0.7), 0.1))
    metal = lerp(nt, blot, 0.25, 0.12)
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25; bump.inputs['Distance'].default_value = 0.003
    h = math_(nt, 'ADD', math_(nt, 'MULTIPLY', st, 0.4), math_(nt, 'MULTIPLY', dents, -1.5))
    h = math_(nt, 'ADD', h, math_(nt, 'MULTIPLY', noise(nt, v, 40, 6, 0.7), 0.3))
    nt.links.new(h, bump.inputs['Height'])
    nn = nt.nodes.new('ShaderNodeNormalMap'); nn.inputs['Strength'].default_value = 0.6
    nt.links.new(img_node(nt, 'rusty_metal_04', 'nor', v, True, 1.6), nn.inputs['Color'])
    nt.links.new(nn.outputs[0], bump.inputs['Normal'])
    nt.links.new(bump.outputs[0], b.inputs['Normal'])
    nt.links.new(col, b.inputs['Base Color']); nt.links.new(rough, b.inputs['Roughness']); nt.links.new(metal, b.inputs['Metallic'])
    CH[m.name] = dict(color=col, rough=rough, metal=metal, bsdf=b, out=out, emit=None)
    return m


def bevel_mat():
    """Wide ground bevel: bare grey steel with strong lengthwise grinding, getting brighter and more worn
    toward the cutting edge in irregular patches (not a uniform bright rim), with scattered dents."""
    m, nt, b, out = _mk('fs_bevel')
    v = nt.nodes.new('ShaderNodeTexCoord').outputs['Object']
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(v, sep.inputs[0])
    # 0 at the bevel shoulder -> 1 at the cutting edge (edge side is -X)
    toEdge = nt.nodes.new('ShaderNodeMapRange'); nt.links.new(sep.outputs[0], toEdge.inputs[0])
    toEdge.inputs[1].default_value = -0.07; toEdge.inputs[2].default_value = -0.2
    toEdge.inputs[3].default_value = 0.0; toEdge.inputs[4].default_value = 1.0
    breakup = ramp(nt, noise(nt, v, 9, 6, 0.65), 0.35, 0.7)
    wear = math_(nt, 'MULTIPLY', toEdge.outputs[0], lerp(nt, breakup, 0.45, 1.15), clamp=True)
    scan = _bw(nt, img_node(nt, 'metal_plate_02', 'diff', v, False, 2.0))
    st = _streaks(nt, v, 90, 1.0)
    base = lerp(nt, wear, 0.24, 0.46)
    base = math_(nt, 'MULTIPLY', base, lerp(nt, 0.55, scan, 1.0))
    base = math_(nt, 'ADD', base, math_(nt, 'MULTIPLY', ramp(nt, st, 0.55, 0.7), 0.06))
    soot = ramp(nt, noise(nt, v, 3, 6, 0.6), 0.55, 0.75)                     # scale remnants left in the grind
    base = lerp(nt, math_(nt, 'MULTIPLY', soot, math_(nt, 'SUBTRACT', 1.0, wear), clamp=True), base, 0.05)
    dents = _dents(nt, v)
    col = mix(nt, math_(nt, 'MULTIPLY', dents, 0.5), _gray(nt, base), (0.08, 0.06, 0.05, 1))
    col = mix(nt, 1.0, col, (1.0, 0.985, 0.96, 1), blend='MULTIPLY')
    rough = lerp(nt, wear, 0.5, 0.26)
    rough = math_(nt, 'ADD', rough, math_(nt, 'MULTIPLY', ramp(nt, st, 0.5, 0.7), 0.12))
    metal = lerp(nt, 0.0, 1.0, 1.0)
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.3; bump.inputs['Distance'].default_value = 0.003
    h = math_(nt, 'ADD', math_(nt, 'MULTIPLY', st, 0.7), math_(nt, 'MULTIPLY', dents, -1.5))
    nt.links.new(h, bump.inputs['Height']); nt.links.new(bump.outputs[0], b.inputs['Normal'])
    nt.links.new(col, b.inputs['Base Color']); nt.links.new(rough, b.inputs['Roughness']); nt.links.new(metal, b.inputs['Metallic'])
    CH[m.name] = dict(color=col, rough=rough, metal=metal, bsdf=b, out=out, emit=None)
    return m


def edge_mat():
    """The narrow edge flat and tip: scuffed bright steel with nicks."""
    return pbr('fs_edge', (0.3, 0.29, 0.28), (0.12, 0.115, 0.11), mscale=14, mrange=(0.35, 0.65), r1=0.3, r2=0.55,
               m1=1.0, m2=1.0, bscale=120, bstr=0.25, var=0.25)


def iron_mat(name='fs_iron', tint=0.05):
    m, nt, b, out = _mk(name)
    v = nt.nodes.new('ShaderNodeTexCoord').outputs['Object']
    scan = _bw(nt, img_node(nt, 'rusty_metal_04', 'diff', v, False, 4))
    blot = ramp(nt, noise(nt, v, 6, 6, 0.6), 0.4, 0.75)
    tone = math_(nt, 'MULTIPLY', lerp(nt, blot, tint * 0.7, tint * 1.5), lerp(nt, 0.5, scan, 1.0))
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    rub = math_(nt, 'MULTIPLY', ramp(nt, geo.outputs['Pointiness'], 0.53, 0.6), ramp(nt, noise(nt, v, 20, 3, 0.6), 0.4, 0.65), clamp=True)
    tone = lerp(nt, rub, tone, 0.3)
    col = _gray(nt, tone)
    rough = lerp(nt, rub, lerp(nt, blot, 0.5, 0.75), 0.3)
    metal = lerp(nt, 0.0, 0.85, 0.85)
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.3
    nt.links.new(math_(nt, 'ADD', noise(nt, v, 60, 6, 0.7), _dents(nt, v)), bump.inputs['Height'])
    nt.links.new(bump.outputs[0], b.inputs['Normal'])
    nt.links.new(col, b.inputs['Base Color']); nt.links.new(rough, b.inputs['Roughness']); nt.links.new(metal, b.inputs['Metallic'])
    CH[m.name] = dict(color=col, rough=rough, metal=metal, bsdf=b, out=out, emit=None)
    return m


def cloth_mat():
    """Dirty unbleached linen: hessian scan weave, ecru tint, grime that gathers toward both ends."""
    m, nt, b, out = _mk('fs_cloth')
    v = nt.nodes.new('ShaderNodeTexCoord').outputs['Object']
    weave = _bw(nt, img_node(nt, 'hessian_230', 'diff', v, False, 14))
    base = mix(nt, 1.0, _gray(nt, lerp(nt, 0.45, weave, 0.7)), (0.42, 0.36, 0.27, 1), blend='MULTIPLY')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(v, sep.inputs[0])
    endsZ = nt.nodes.new('ShaderNodeMapRange'); nt.links.new(sep.outputs[2], endsZ.inputs[0])
    endsZ.inputs[1].default_value = -0.33; endsZ.inputs[2].default_value = -0.1   # grip centre -> ends
    endsZ.inputs[3].default_value = 0.0; endsZ.inputs[4].default_value = 1.0
    endsV = math_(nt, 'ABSOLUTE', math_(nt, 'SUBTRACT', endsZ.outputs[0], 0.0))
    grime = math_(nt, 'MULTIPLY', ramp(nt, noise(nt, v, 18, 8, 0.65), 0.3, 0.65), lerp(nt, endsV, 0.7, 1.1), clamp=True)
    stains = ramp(nt, noise(nt, v, 5, 4, 0.6), 0.6, 0.78)
    col = mix(nt, math_(nt, 'MULTIPLY', grime, 0.85), base, (0.11, 0.085, 0.06, 1))
    col = mix(nt, math_(nt, 'MULTIPLY', stains, 0.6), col, (0.22, 0.06, 0.04, 1))   # old dried stains
    rough = lerp(nt, 0.0, 0.95, 0.95)
    metal = lerp(nt, 0.0, 0.0, 0.0)
    nn = nt.nodes.new('ShaderNodeNormalMap'); nn.inputs['Strength'].default_value = 1.6
    nt.links.new(img_node(nt, 'hessian_230', 'nor', v, True, 14), nn.inputs['Color'])
    nt.links.new(nn.outputs[0], b.inputs['Normal'])
    nt.links.new(col, b.inputs['Base Color']); nt.links.new(rough, b.inputs['Roughness']); nt.links.new(metal, b.inputs['Metallic'])
    CH[m.name] = dict(color=col, rough=rough, metal=metal, bsdf=b, out=out, emit=None)
    return m


# ------------------------------------------------------------------ geometry
L_BODY = 1.5      # straight part of the blade (from the guard)
L_TIP = 1.86      # spine end / tip point
SPINE_X = 0.125   # back of the blade (+X)
HALF_T = 0.04     # half thickness of the flat at the base (8 cm thick blade)
BEVEL_W = 0.095   # width of the ground bevel
EDGE_HALF = 0.004


def edge_x(z):
    """Cutting side (-X): 0.145 at the guard swelling to 0.19 near the tip shoulder."""
    u = min(1.0, z / L_BODY)
    return -(0.145 + 0.045 * (u ** 1.6))


def blade():
    """Lofted blade with real chamfers: spine flat, black flat, wide bevel, edge flat on each side."""
    N = 64
    rows = []
    tipA = Vector((edge_x(L_BODY), L_BODY))           # tip shoulder on the cutting side
    tipP = Vector((SPINE_X, L_TIP))                   # tip point on the spine
    for i in range(N + 1):
        t = i / N
        zS = L_TIP * t
        if t <= 0.8:
            ze = L_BODY * t / 0.8; e = Vector((edge_x(ze), ze))
        else:
            k = (t - 0.8) / 0.2; e = tipA.lerp(tipP, k)
        sp = Vector((SPINE_X, zS))
        d = (sp - e)
        bw = min(BEVEL_W, d.length * 0.62)
        bv = e + d.normalized() * bw if d.length > 1e-6 else e.copy()
        ht = HALF_T * (1 - 0.45 * t)                    # distal taper
        rows.append((sp, bv, e, ht))
    me = bpy.data.meshes.new('blade'); o = bpy.data.objects.new('blade', me); bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    # per row: spine back, spine front, bevel-shoulder front, edge front, edge back, bevel-shoulder back
    R = []
    for sp, bv, e, ht in rows:
        R.append([bm.verts.new((sp.x, ht, sp.y)), bm.verts.new((sp.x, -ht, sp.y)),
                  bm.verts.new((bv.x, -ht, bv.y)), bm.verts.new((e.x, -EDGE_HALF, e.y)),
                  bm.verts.new((e.x, EDGE_HALF, e.y)), bm.verts.new((bv.x, ht, bv.y))])
    mats = [3, 0, 1, 2, 1, 0]   # face strip material: spine(iron), flat front, bevel front, edge, bevel back, flat back
    for i in range(N):
        a, b2 = R[i], R[i + 1]
        for j in range(6):
            j2 = (j + 1) % 6
            try:
                f = bm.faces.new((a[j], a[j2], b2[j2], b2[j]))
                f.material_index = mats[j]
            except ValueError:
                pass
    cap = bm.faces.new(list(reversed(R[0]))); cap.material_index = 3
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    for mt in (M['scale'], M['bevel'], M['edge'], M['iron']):
        o.data.materials.append(mt)
    # nicks along the cutting edge: pull a few short runs of edge vertices inward
    random.seed(21)
    for v in o.data.vertices:
        if abs(v.co.y) <= EDGE_HALF + 1e-4 and 0.2 < v.co.z < L_BODY and random.random() < 0.18:
            v.co.x += random.uniform(0.004, 0.012)
    bv_ = o.modifiers.new('bv', 'BEVEL'); bv_.width = 0.0025; bv_.segments = 2; bv_.limit_method = 'ANGLE'
    bv_.angle_limit = math.radians(35); bv_.harden_normals = True
    o = apply_all(o)
    _select([o]); bpy.ops.object.shade_smooth_by_angle(angle=math.radians(28))
    return o


def guard():
    """Round 'forge core' collar around the blade root with vent slots and a faint ember glow inside."""
    I = M['iron']
    parts = [cyl(0.118, 0.118, 0.085, (0, 0, -0.035), I, verts=40, bevel=0.008)]
    parts.append(cyl(0.104, 0.104, 0.092, (0, 0, -0.035), M['glow'], verts=40))       # glowing core behind the slots
    for k in range(10):                                                                  # vent slots: dark recesses
        a = k / 10 * 2 * math.pi
        parts.append(cube((0.014, 0.03, 0.06), (math.cos(a) * 0.118, math.sin(a) * 0.118, -0.035), M['void'],
                          rot=(0, 0, a), bevel=0.0, smooth=False))
    parts.append(torus(0.12, 0.009, (0, 0, 0.008), I)); parts.append(torus(0.12, 0.009, (0, 0, -0.078), I))
    for s in (-1, 1):                                                                    # side lugs
        parts.append(cube((0.05, 0.05, 0.05), (s * 0.15, 0, -0.035), I, bevel=0.01))
        parts.append(sphere(0.012, (s * 0.175, 0, -0.035), I, segs=10, rings=6))
    return parts


def grip():
    """Grip core wrapped in an overlapping cloth ribbon; knotted start, hanging tail, binding cord."""
    C, I = M['cloth'], M['iron']
    parts = [cyl(0.024, 0.023, 0.52, (0, 0, -0.34), I, verts=20)]
    z0, z1, r0 = -0.085, -0.575, 0.0275
    pitch, width = 0.04, 0.052          # width > pitch: each turn overlaps the previous one
    turns = (z0 - z1) / pitch
    steps = int(turns * 28)
    me = bpy.data.meshes.new('wrap'); o = bpy.data.objects.new('wrap', me); bpy.context.collection.objects.link(o)
    bm = bmesh.new(); prev = None
    for i in range(steps + 1):
        t = i / steps; th = t * turns * 2 * math.pi; zc = z0 - t * (z0 - z1)
        # later turns lie over earlier ones; tension varies so the wrap bulges and pinches unevenly
        r = r0 + 0.0016 * t * turns / 4 + 0.0009 * math.sin(th * 2.3 + t * 7) + 0.0006 * math.sin(th * 5.7)
        row = []
        for s, dr in ((-0.5, -0.0006), (-0.25, 0.0011), (0.25, 0.0016), (0.5, 0.0006)):  # slightly thicker overlapping lower edge
            rr = r + dr
            row.append(bm.verts.new((math.cos(th) * rr, math.sin(th) * rr, zc + s * width)))
        if prev:
            for j in range(3):
                bm.faces.new((prev[j], prev[j + 1], row[j + 1], row[j]))
        prev = row
    bm.to_mesh(me); bm.free()
    so = o.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.0018; so.offset = 1
    o.data.materials.append(C); o = apply_all(o)
    _select([o]); bpy.ops.object.shade_smooth()
    parts.append(o)
    # knotted start under the guard: two lumps of tied cloth
    parts.append(sphere(0.02, (0.022, -0.014, -0.075), C, scale=(1.2, 0.9, 0.8), segs=12, rings=8))
    parts.append(sphere(0.016, (0.03, 0.006, -0.088), C, scale=(1.0, 1.0, 0.9), segs=12, rings=8))
    # binding cord near the pommel and a loose tail of cloth hanging from it
    for k in range(3):
        parts.append(torus(0.031, 0.0035, (0, 0, -0.565 - k * 0.008), C))
    tail = bpy.data.meshes.new('tail'); to = bpy.data.objects.new('tail', tail); bpy.context.collection.objects.link(to)
    bm = bmesh.new(); prev = None
    for i in range(14):
        t = i / 13
        x = 0.032 + 0.012 * t; z = -0.575 - 0.17 * t; y = 0.01 * math.sin(t * 5)
        row = [bm.verts.new((x, y - 0.015 * (1 - t * 0.4), z)), bm.verts.new((x, y + 0.015 * (1 - t * 0.4), z))]
        if prev: bm.faces.new((prev[0], prev[1], row[1], row[0]))
        prev = row
    bm.to_mesh(tail); bm.free()
    to.modifiers.new('so', 'SOLIDIFY').thickness = 0.002
    to.data.materials.append(C); to = apply_all(to); parts.append(to)
    return parts


def pommel():
    """Tapered octagonal ingot with a rivet band."""
    I = M['iron']
    p = [cyl(0.034, 0.046, 0.075, (0, 0, -0.62), I, verts=8, bevel=0.006, smooth=False),
         cyl(0.046, 0.04, 0.02, (0, 0, -0.665), I, verts=8, bevel=0.004, smooth=False),
         torus(0.036, 0.005, (0, 0, -0.588), I)]
    for k in range(8):
        a = k / 8 * 2 * math.pi + math.pi / 8
        p.append(sphere(0.006, (math.cos(a) * 0.041, math.sin(a) * 0.041, -0.625), I, segs=8, rings=5))
    return p


def build():
    global M
    M = {'scale': scale_mat(), 'bevel': bevel_mat(), 'edge': edge_mat(), 'iron': iron_mat(), 'cloth': cloth_mat(),
         'glow': pbr('fs_glow', (0.25, 0.05, 0.01), r1=0.6, bstr=0.0, emit=((1.0, 0.35, 0.06), 2.5)),
         'void': pbr('fs_void', (0.01, 0.008, 0.007), r1=0.9, bstr=0.0)}
    parts = [blade()] + guard() + grip() + pommel()
    sw = join(parts, 'sword_forge')
    for v in sw.data.vertices:
        v.co.z += 0.16      # same grip point as the standard sword: origin where the main hand holds
    print('tris', tris(sw))
    return sw


# ------------------------------------------------------------------ review renders
def review(sw):
    sc = bpy.context.scene
    os.makedirs(os.path.join(ROOT, 'renders'), exist_ok=True)
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, -0.9))
    g = bpy.context.active_object
    gm = pbr('rv_floor', (0.025, 0.022, 0.02), r1=0.85, bscale=8, bstr=0.2); g.data.materials.append(gm)
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    wt = w.node_tree; env = wt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(os.path.join(ROOT, 'assets', 'sky.jpg'))
    wt.links.new(env.outputs[0], wt.nodes['Background'].inputs['Color']); wt.nodes['Background'].inputs['Strength'].default_value = 0.25
    for name, loc, e, col, size in (('key', (-1.6, -2.2, 2.0), 320, (1, 0.86, 0.74), 2.0),
                                    ('rim', (1.8, 1.6, 1.2), 380, (1, 0.55, 0.35), 1.5),
                                    ('fill', (2.2, -1.8, 0.4), 90, (0.75, 0.82, 1), 3.0)):
        L = bpy.data.lights.new(name, 'AREA'); L.energy = e; L.color = col; L.size = size
        o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); o.location = loc
        o.rotation_euler = (Vector((0, 0, 0.6)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.cameras.new('cam'); co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    sc.cycles.samples = int(os.environ.get('SAMPLES', 64)); sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 90
    sw.location = (0, 0, 0)
    shots = [  # name, camera location, target, lens, resolution
        ('front', (0, -3.2, 0.65), (0, 0, 0.65), 40, (900, 1400)),
        ('three_quarter', (1.9, -2.4, 1.3), (0, 0, 0.65), 40, (900, 1400)),
        ('side', (3.2, 0.0, 0.75), (0, 0, 0.75), 40, (900, 1400)),
        ('blade_close', (-0.55, -0.55, 1.55), (-0.08, 0, 1.15), 50, (1200, 900)),
        ('grip_close', (0.34, -0.44, 0.0), (0, 0, -0.2), 60, (1000, 1000)),
    ]
    for name, loc, tgt, lens, res in shots:
        cam.lens = lens; co.location = loc
        co.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        sc.render.resolution_x, sc.render.resolution_y = res
        sc.render.filepath = os.path.join(ROOT, 'renders', f'forge_{name}.jpg')
        bpy.ops.render.render(write_still=True)
        print('rendered', name)


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    reset()
    sw = build()
    uv_atlas([sw], margin=0.003)
    if mode in ('review', 'all'):
        review(sw)
    if mode in ('bake', 'all'):
        for o in list(bpy.data.objects):
            if o is not sw: o.hide_render = True
        sw.location = (0, 0, 0)
        bake([sw], 2048, 'sword_forge', ao_samples=48, ao_strength=0.45)
        export([sw], 'sword_forge')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'sword_forge.blend'))
    print('saved blend')
