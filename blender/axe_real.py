"""Double-bitted great axe (original design) in the same photoreal pipeline as the greatsword:
dense geometry with edge nicks, CC0 scanned PBR textures (Poly Haven), baked to 2K for the game.
Origin = grip point held by the hand; length along +Z here (+Y in the game), bits along +-X."""
import bpy, bmesh, math, os, random, sys
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from lib import _select, CH
from weapons import blade_mesh
from sword_real import scanned_mat, leather_mat, cord_wrap

C = 1.72          # height of the head centre above the grip point
REACH, HALF = 0.62, 0.52


def bit_outline(side=1, seed=5, step=0.012):
    """Crescent bit: neck at the socket, sweeping out to two horns joined by the curved cutting edge.
    The cutting edge gets random battle nicks. Returned counter-clockwise for the given side."""
    random.seed(seed)
    pts = [(0.03, C - 0.15), (0.16, C - 0.19)]
    # lower flank curves out to the lower horn (slightly concave, like a bearded axe)
    hx, hz = REACH * (0.62 + 0.38 * math.cos(1.15)), HALF
    for i in range(1, 8):
        t = i / 8
        pts.append((0.16 + (hx - 0.16) * t, (C - 0.19) + (-(hz) + 0.19) * t + 0.05 * math.sin(math.pi * t)))
    # cutting edge
    n = int(2.3 * 0.6 / step)
    nick, nick_len = 0.0, 0
    for i in range(n + 1):
        a = -1.15 + 2.3 * i / n
        if nick_len <= 0 and random.random() < 0.05 and 3 < i < n - 3:
            nick_len = random.randint(2, 4); nick = random.uniform(0.004, 0.013)
        d = 0.0
        if nick_len > 0:
            d = nick; nick_len -= 1
        d += random.uniform(0, 0.0015)
        r = 1.0 - d / REACH
        pts.append((REACH * (0.62 + 0.38 * math.cos(a)) * r, C + HALF * math.sin(a) / math.sin(1.15)))
    for i in range(7, 0, -1):
        t = i / 8
        pts.append((0.16 + (hx - 0.16) * t, (C + 0.19) + (hz - 0.19) * t - 0.05 * math.sin(math.pi * t)))
    pts += [(0.16, C + 0.19), (0.03, C + 0.15)]
    if side < 0:
        pts = [(-x, z) for x, z in reversed(pts)]
    return pts


def lens_mesh(name, outline, thick, inset, centre):
    """Solid wedge-section plate: the outline is the sharp rim (y = 0); an inner loop, pulled `inset`
    toward `centre`, sits at +-thick. (bmesh inset_region leaves this concave outline untouched, which
    gave two loose sheets, so the rim strip is built by hand.)"""
    me = bpy.data.meshes.new(name); o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    cx, cz = centre
    rim = [bm.verts.new((x, 0, z)) for x, z in outline]
    caps = []
    for sgn in (-1, 1):
        inner = []
        for x, z in outline:
            dx, dz = cx - x, cz - z; L = math.hypot(dx, dz) or 1; d = min(inset, 0.45 * L)
            inner.append(bm.verts.new((x + dx / L * d, sgn * thick, z + dz / L * d)))
        n = len(outline)
        for i in range(n):
            j = (i + 1) % n
            quad = (rim[i], rim[j], inner[j], inner[i]) if sgn < 0 else (rim[j], rim[i], inner[i], inner[j])
            bm.faces.new(quad)
        caps.append(bm.faces.new(inner if sgn < 0 else list(reversed(inner))))
    bmesh.ops.triangulate(bm, faces=caps)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    return o


def build():
    reset()
    iron = scanned_mat('ax_iron', ('rusty_metal_04', 'rusty_metal_04', 1.1), mask_range=(0.62, 0.84),
                       tint=(0.27, 0.26, 0.25), desat=True, rust_tint=(0.6, 0.5, 0.45))
    plate = scanned_mat('ax_plate', ('rusty_metal_04', 'rusty_metal_04', 2.5), mask_range=(0.55, 0.8), edge_polish=False,
                        tint=(0.13, 0.125, 0.12), desat=True, rust_tint=(0.5, 0.45, 0.4))
    leather = leather_mat('ax_leather')
    wood = pbr('ax_haft', (0.035, 0.022, 0.018), (0.075, 0.045, 0.03), mscale=5, r1=0.62, r2=0.82, bscale=80, bstr=0.3, stretch=(1, 1, 0.2))
    parts = []
    for s, seed in ((1, 5), (-1, 11)):
        bit = lens_mesh('bit', bit_outline(s, seed), 0.028, 0.07, (s * 0.3, C))
        bit.data.materials.append(iron)
        bv = bit.modifiers.new('bv', 'BEVEL'); bv.width = 0.0015; bv.segments = 2; bv.limit_method = 'ANGLE'
        bit = apply_all(bit)
        _select([bit]); bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
        parts.append(bit)
    # socket (eye) clamping the bits, with a reinforcing band top and bottom and rivets
    parts.append(cube((0.17, 0.115, 0.42), (0, 0, C), plate, bevel=0.012))
    for dz in (-0.2, 0.2):
        parts.append(cube((0.2, 0.135, 0.05), (0, 0, C + dz), plate, bevel=0.008))
    for s in (-1, 1):
        for (x, dz) in ((-0.05, -0.1), (0.05, -0.1), (-0.05, 0.1), (0.05, 0.1), (0, 0)):
            parts.append(sphere(0.014, (x, s * 0.06, C + dz), plate, scale=(1, 0.6, 1), segs=16, rings=8))
    # langets: iron straps running down the haft from the socket, riveted
    for s in (-1, 1):
        parts.append(cube((0.045, 0.01, 0.62), (0, s * 0.036, C - 0.52), plate, bevel=0.003))
        for dz in (-0.3, -0.5, -0.7):
            parts.append(sphere(0.011, (0, s * 0.043, C + dz), plate, scale=(1, 0.6, 1), segs=12, rings=6))
    # top spike: four-sided, on a collar
    parts.append(cyl(0.05, 0.045, 0.06, (0, 0, C + 0.26), plate, verts=16, bevel=0.004))
    parts.append(cyl(0.042, 0.0, 0.42, (0, 0, C + 0.5), iron, verts=4, smooth=False))
    # haft, iron bands, leather grip with cord wrap, pommel cap with a short butt spike
    parts.append(cyl(0.03, 0.033, 2.05, (0, 0, 0.5), wood, verts=20))
    for z in (0.5, 0.86):
        parts.append(cyl(0.04, 0.04, 0.045, (0, 0, z), plate, verts=20, bevel=0.004))
    parts.append(cyl(0.035, 0.034, 0.86, (0, 0, -0.05), leather, verts=24))
    parts.append(cord_wrap(0.36, -0.46, 0.038, 0.0065, 26))
    parts.append(cord_wrap(0.355, -0.455, 0.038, 0.0065, 26, phase=math.pi))
    parts.append(cyl(0.044, 0.04, 0.07, (0, 0, -0.52), plate, verts=20, bevel=0.005))
    parts.append(cyl(0.03, 0.0, 0.12, (0, 0, -0.61), iron, verts=6, rot=(math.pi, 0, 0), smooth=False))
    return join(parts, 'axe')


if __name__ == '__main__':
    from mathutils import Vector
    ax = build()
    uv_atlas([ax], margin=0.003)
    bake([ax], 2048, 'axe', ao_samples=64, ao_strength=0.5)
    export([ax], 'axe')
    me = ax.data
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    print('bounds x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f' % (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)))
