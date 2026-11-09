"""Segmented characters (rigid armour parts). Each part's origin is its joint; Blender -Y is the front.
Part list shared by every humanoid: pelvis torso head uarm farm hand thigh shin foot (+cloak on the hero)."""
import bpy, bmesh, math, random, json, os
from lib import *
from lib import _select

# joint offsets relative to the parent joint (three.js coords: x, y-up, z-forward)
SKELETON = {
    'pelvis': [None, [0, 1.0, 0]],
    'torso': ['pelvis', [0, 0.05, 0]],
    'head': ['torso', [0, 0.51, 0]],
    'cloak': ['torso', [0, 0.47, -0.13]],
    'uarmR': ['torso', [-0.235, 0.42, 0]], 'uarmL': ['torso', [0.235, 0.42, 0]],
    'farmR': ['uarmR', [0, -0.30, 0]], 'farmL': ['uarmL', [0, -0.30, 0]],
    'handR': ['farmR', [0, -0.27, 0]], 'handL': ['farmL', [0, -0.27, 0]],
    'thighR': ['pelvis', [-0.105, -0.04, 0]], 'thighL': ['pelvis', [0.105, -0.04, 0]],
    'shinR': ['thighR', [0, -0.44, 0]], 'shinL': ['thighL', [0, -0.44, 0]],
    'footR': ['shinR', [0, -0.43, 0]], 'footL': ['shinL', [0, -0.43, 0]],
}


def world_pos(name):
    """Blender-space world position of a joint in the rest pose."""
    x = y = z = 0.0
    while name:
        par, off = SKELETON[name]
        x += off[0]; z += off[1]; y -= off[2]
        name = par
    return (x, y, z)


def steel(name, base=(0.045, 0.044, 0.046), rust=(0.12, 0.055, 0.03), amt=(0.62, 0.85), edge=(0.28, 0.27, 0.26)):
    return pbr(name, base, rust, mscale=3, mrange=amt, r1=0.4, r2=0.85, m1=1.0, m2=0.25,
               bscale=45, bstr=0.1, edge=edge, erange=(0.56, 0.64), var=0.3)


def cloth(name, c1, c2, double=False):
    return pbr(name, c1, c2, mscale=4, mrange=(0.4, 0.7), r1=0.9, r2=0.97, bscale=160, bstr=0.25, double=double,
               height=lambda nt, v: math_(nt, 'MULTIPLY', wave(nt, v, 60, 3), 0.3))


def leather(name, c1=(0.05, 0.032, 0.022), c2=(0.1, 0.065, 0.04)):
    return pbr(name, c1, c2, mscale=6, r1=0.6, r2=0.8, bscale=90, bstr=0.2)


def skin(name, c1, c2):
    return pbr(name, c1, c2, mscale=5, mrange=(0.35, 0.75), r1=0.55, r2=0.75, bscale=70, bstr=0.25,
               height=lambda nt, v: math_(nt, 'MULTIPLY', voronoi(nt, v, 25, 'Distance'), 0.4))


def chain(name):
    def rings(nt, v):
        return math_(nt, 'MULTIPLY', voronoi(nt, v, 140, 'Distance'), 1.0)
    return pbr(name, (0.035, 0.034, 0.034), (0.07, 0.045, 0.03), mscale=4, mrange=(0.6, 0.85), r1=0.5, r2=0.85,
               m1=1.0, m2=0.3, bscale=200, bstr=0.5, height=rings)


# ------------------------------------------------------------------ the hero (original mercenary)
def build_hero():
    A = steel('h_steel')
    D = steel('h_dark', base=(0.025, 0.024, 0.026), amt=(0.7, 0.9), edge=(0.2, 0.19, 0.19))
    Lt = leather('h_leather')
    C = cloth('h_cloth', (0.035, 0.02, 0.02), (0.09, 0.025, 0.022))
    CL = cloth('h_cloak', (0.022, 0.02, 0.02), (0.045, 0.018, 0.016), double=True)
    M = chain('h_mail')
    P = {}
    # pelvis: mail skirt, belt, front/side tassets
    P['pelvis'] = join([
        cyl(0.17, 0.2, 0.26, (0, 0, -0.08), M, verts=18, scale=(1, 0.75, 1)),
        cyl(0.172, 0.172, 0.06, (0, 0, 0.03), Lt, verts=18, scale=(1, 0.78, 1), bevel=0.01),
        cube((0.06, 0.03, 0.05), (0, -0.14, 0.03), D, bevel=0.008),
        cube((0.16, 0.025, 0.22), (-0.085, -0.13, -0.12), A, rot=(math.radians(-8), 0, math.radians(8)), bevel=0.012, subsurf=1),
        cube((0.16, 0.025, 0.22), (0.085, -0.13, -0.12), A, rot=(math.radians(-8), 0, math.radians(-8)), bevel=0.012, subsurf=1),
    ], 'pelvis')
    # torso: breastplate + backplate + gorget + mail waist
    P['torso'] = join([
        cyl(0.15, 0.17, 0.24, (0, 0, 0.1), M, verts=18, scale=(1, 0.75, 1)),
        sphere(0.2, (0, -0.01, 0.3), A, scale=(1.0, 0.66, 1.15), segs=24, rings=14, subsurf=1),
        cube((0.36, 0.06, 0.08), (0, -0.07, 0.15), A, rot=(math.radians(-10), 0, 0), bevel=0.02, subsurf=1),
        cyl(0.085, 0.075, 0.1, (0, 0, 0.48), D, verts=16, bevel=0.01),
        cube((0.42, 0.04, 0.05), (0, 0.11, 0.45), Lt, bevel=0.01),  # cloak strap
    ], 'torso')
    # head: closed helm with T-shaped visor, brow ridge, rivets
    hs = [
        sphere(0.13, (0, 0, 0.14), A, scale=(0.95, 1.05, 1.08), segs=24, rings=16, subsurf=1),
        cube((0.025, 0.24, 0.03), (0, 0.0, 0.283), D, bevel=0.008, subsurf=1),
        cube((0.2, 0.02, 0.022), (0, -0.125, 0.15), (bpy.data.materials.get('h_dark')), bevel=0.004),
        cube((0.022, 0.02, 0.09), (0, -0.13, 0.1), D, bevel=0.004),
        cyl(0.11, 0.12, 0.08, (0, 0.005, 0.02), A, verts=20, bevel=0.01),
    ]
    for a in range(-3, 4):
        ang = a * 0.35
        hs.append(sphere(0.008, (math.sin(ang) * 0.122, -math.cos(ang) * 0.13, 0.065), D, segs=8, rings=5))
    P['head'] = join(hs, 'head')
    # visor slit is a separate black inset
    slit = pbr('h_void', (0.004, 0.004, 0.004), r1=0.95, bscale=5, bstr=0.0)
    s1 = cube((0.17, 0.012, 0.016), (0, -0.136, 0.148), slit, bevel=0.0)
    s2 = cube((0.016, 0.012, 0.075), (0, -0.14, 0.095), slit, bevel=0.0)
    P['head'] = join([P['head'], s1, s2], 'head')
    # upper arm: layered pauldron dome + rerebrace
    P['uarm'] = join([
        sphere(0.12, (0, 0, -0.01), A, scale=(1.05, 1.0, 0.85), cut=-0.15, segs=20, rings=12),
        sphere(0.11, (0, 0, -0.07), D, scale=(1.1, 1.05, 0.7), cut=0.0, segs=20, rings=10),
        cyl(0.055, 0.05, 0.3, (0, 0, -0.15), C, verts=12),
        cyl(0.064, 0.058, 0.17, (0, 0, -0.2), A, verts=14, bevel=0.005),
    ], 'uarm')
    P['farm'] = join([
        sphere(0.065, (0, 0, 0), A, scale=(1, 1, 0.9), segs=16, rings=10),
        sphere(0.05, (0, 0.045, -0.005), D, scale=(1.0, 0.6, 1.1), segs=12, rings=8),
        cyl(0.057, 0.045, 0.24, (0, 0, -0.14), A, verts=14, bevel=0.006),
        cyl(0.062, 0.06, 0.035, (0, 0, -0.06), D, verts=14),
    ], 'farm')
    P['hand'] = join([
        cyl(0.05, 0.055, 0.06, (0, 0, -0.02), D, verts=12, bevel=0.005),
        cube((0.07, 0.095, 0.085), (0, -0.005, -0.08), A, bevel=0.02, subsurf=1),
        cube((0.07, 0.035, 0.06), (0, -0.05, -0.12), Lt, bevel=0.012, subsurf=1),
        sphere(0.025, (0.035, -0.03, -0.065), Lt, segs=10, rings=6),
    ], 'hand')
    P['thigh'] = join([
        cyl(0.075, 0.09, 0.44, (0, 0, -0.21), C, verts=14),
        cyl(0.088, 0.072, 0.3, (0, -0.012, -0.19), A, verts=16, bevel=0.006, scale=(1, 0.9, 1)),
    ], 'thigh')
    P['shin'] = join([
        sphere(0.07, (0, -0.03, 0.0), A, scale=(1, 0.9, 1.1), segs=16, rings=10),
        sphere(0.04, (0, -0.085, 0.0), D, scale=(1, 0.5, 1), segs=12, rings=8),
        cyl(0.052, 0.068, 0.4, (0, 0, -0.21), A, verts=16, bevel=0.006),
        cyl(0.06, 0.06, 0.05, (0, 0, -0.38), Lt, verts=14),
    ], 'shin')
    P['foot'] = join([
        cube((0.105, 0.24, 0.085), (0, -0.05, -0.05), A, bevel=0.025, subsurf=1),
        cube((0.11, 0.22, 0.025), (0, -0.04, -0.085), Lt, bevel=0.006),
    ], 'foot')
    # tattered cloak: hangs from the shoulders down the back (+Y), ragged hem
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=10, y_subdivisions=16, size=1)
    ck = bpy.context.active_object; ck.name = 'cloak'
    random.seed(7)
    bm = bmesh.new(); bm.from_mesh(ck.data)
    for v in bm.verts:
        u, t = v.co.x + 0.5, v.co.y + 0.5  # u across, t 0 bottom .. 1 top
        x = (u - 0.5) * (0.5 + (1 - t) * 0.3)
        z = -(1 - t) * 1.12
        y = 0.06 * math.sin(u * math.pi) + (1 - t) * 0.12 + 0.02 * math.sin(u * 19 + t * 7)
        v.co = Vector((x, y, z))
    kill = [f for f in bm.faces if f.calc_center_median().z < -0.85 and random.random() < 0.35 + (-0.85 - f.calc_center_median().z) * 2]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(ck.data); bm.free()
    m = ck.modifiers.new('so', 'SOLIDIFY'); m.thickness = 0.008
    ck.data.materials.append(CL)
    ck = apply_all(ck)
    _select([ck]); bpy.ops.object.shade_smooth()
    P['cloak'] = ck
    return P


# ------------------------------------------------------------------ undead soldier (grunt / brute)
def build_grunt():
    S = skin('g_skin', (0.15, 0.14, 0.115), (0.085, 0.075, 0.062))
    R = steel('g_rust', base=(0.08, 0.07, 0.06), rust=(0.16, 0.075, 0.04), amt=(0.4, 0.65), edge=(0.22, 0.2, 0.18))
    C = cloth('g_rag', (0.06, 0.05, 0.038), (0.1, 0.085, 0.062))
    Lt = leather('g_leather', (0.05, 0.035, 0.026), (0.08, 0.055, 0.038))
    M = chain('g_mail')
    eye = pbr('g_eye', (0.4, 0.05, 0.02), r1=0.3, bstr=0.0, emit=((1.0, 0.18, 0.05), 6.0))
    P = {}
    P['pelvis'] = join([
        cyl(0.15, 0.19, 0.27, (0, 0, -0.09), C, verts=16, scale=(1, 0.75, 1)),
        cyl(0.155, 0.155, 0.05, (0, 0, 0.03), Lt, verts=16, scale=(1, 0.8, 1)),
    ], 'pelvis')
    P['torso'] = join([
        cyl(0.13, 0.15, 0.32, (0, 0, 0.12), S, verts=16, scale=(1, 0.72, 1)),
        sphere(0.18, (0, 0.0, 0.31), M, scale=(1.0, 0.7, 0.95), segs=18, rings=10),
        cube((0.3, 0.05, 0.22), (0, -0.11, 0.32), R, rot=(math.radians(-6), 0, 0), bevel=0.02, subsurf=1),
        cyl(0.05, 0.055, 0.14, (0, 0, 0.47), S, verts=12),
        sphere(0.07, (-0.2, 0, 0.42), S, segs=12, rings=8), sphere(0.07, (0.2, 0, 0.42), S, segs=12, rings=8),
    ], 'torso')
    P['head'] = join([
        sphere(0.1, (0, 0.0, 0.11), S, scale=(0.92, 1.0, 1.15), segs=18, rings=12),
        sphere(0.06, (0, -0.045, 0.03), S, scale=(1.0, 1.0, 0.8), segs=12, rings=8),
        sphere(0.135, (0, 0.0, 0.16), R, scale=(1, 1.05, 0.7), cut=0.05, segs=18, rings=10),
        cyl(0.18, 0.17, 0.018, (0, 0, 0.165), R, verts=20),
        sphere(0.017, (-0.038, -0.088, 0.12), eye, segs=8, rings=6),
        sphere(0.017, (0.038, -0.088, 0.12), eye, segs=8, rings=6),
    ], 'head')
    P['uarm'] = join([
        sphere(0.06, (0, 0, 0), S, segs=12, rings=8),
        cyl(0.045, 0.04, 0.34, (0, 0, -0.15), S, verts=12),
        cyl(0.055, 0.05, 0.12, (0, 0, -0.06), C, verts=12),
    ], 'uarm')
    P['farm'] = join([
        sphere(0.044, (0, 0, 0), S, segs=12, rings=8),
        cyl(0.04, 0.032, 0.3, (0, 0, -0.13), S, verts=12),
        cyl(0.045, 0.04, 0.1, (0, 0, -0.18), Lt, verts=12),
    ], 'farm')
    P['hand'] = join([
        cyl(0.033, 0.036, 0.06, (0, 0, -0.02), S, verts=10),
        cube((0.06, 0.08, 0.08), (0, 0, -0.07), S, bevel=0.02, subsurf=1),
        cube((0.05, 0.03, 0.06), (0, -0.045, -0.1), S, bevel=0.012, subsurf=1),
    ], 'hand')
    P['thigh'] = join([sphere(0.08, (0, 0, 0), C, segs=12, rings=8),
                       cyl(0.07, 0.085, 0.47, (0, 0, -0.22), C, verts=14)], 'thigh')
    P['shin'] = join([
        sphere(0.06, (0, 0, 0), S, segs=12, rings=8),
        cyl(0.045, 0.06, 0.47, (0, 0, -0.21), S, verts=12),
        cyl(0.055, 0.06, 0.18, (0, 0, -0.3), C, verts=12),
    ], 'shin')
    P['foot'] = join([cube((0.09, 0.22, 0.08), (0, -0.05, -0.05), Lt, bevel=0.025, subsurf=1)], 'foot')
    return P


# ------------------------------------------------------------------ boss: horned demon knight
def build_boss():
    A = steel('b_steel', base=(0.03, 0.026, 0.026), rust=(0.14, 0.03, 0.025), amt=(0.55, 0.8), edge=(0.3, 0.2, 0.17))
    D = steel('b_dark', base=(0.015, 0.013, 0.014), rust=(0.08, 0.02, 0.02), amt=(0.6, 0.85), edge=(0.2, 0.12, 0.1))
    H = pbr('b_horn', (0.16, 0.13, 0.1), (0.05, 0.04, 0.035), mscale=2, mrange=(0.3, 0.8), r1=0.5, r2=0.7, bscale=40, bstr=0.4,
            stretch=(1, 1, 6), height=lambda nt, v: math_(nt, 'MULTIPLY', wave(nt, v, 30, 4, 'RINGS'), 0.5))
    F = pbr('b_flesh', (0.1, 0.02, 0.018), (0.035, 0.008, 0.008), mscale=5, r1=0.45, r2=0.6, bscale=50, bstr=0.4,
            emit=((0.5, 0.05, 0.02), 0.12),
            height=lambda nt, v: math_(nt, 'MULTIPLY', voronoi(nt, v, 18, 'Distance'), 0.6))
    eye = pbr('b_eye', (0.6, 0.2, 0.05), r1=0.3, bstr=0.0, emit=((1.0, 0.45, 0.08), 12.0))
    P = {}
    P['pelvis'] = join([
        cyl(0.18, 0.22, 0.28, (0, 0, -0.08), D, verts=18, scale=(1, 0.8, 1), bevel=0.01),
        cube((0.2, 0.03, 0.26), (-0.1, -0.15, -0.14), A, rot=(math.radians(-8), 0, math.radians(10)), bevel=0.012, subsurf=1),
        cube((0.2, 0.03, 0.26), (0.1, -0.15, -0.14), A, rot=(math.radians(-8), 0, math.radians(-10)), bevel=0.012, subsurf=1),
    ], 'pelvis')
    ts = [
        cyl(0.15, 0.18, 0.25, (0, 0, 0.1), F, verts=18, scale=(1, 0.75, 1)),
        sphere(0.22, (0, -0.01, 0.33), A, scale=(1.1, 0.75, 1.0), segs=24, rings=14, subsurf=1),
        cyl(0.1, 0.09, 0.1, (0, 0, 0.48), D, verts=16, bevel=0.01),
    ]
    for i, (x, z) in enumerate(((-0.1, 0.42), (0.1, 0.42), (-0.14, 0.3), (0.14, 0.3))):
        ts.append(cyl(0.03, 0.0, 0.12, (x, -0.17, z), D, verts=8, rot=(math.radians(80), 0, 0)))
    P['torso'] = join(ts, 'torso')
    hs = [
        sphere(0.14, (0, 0, 0.14), A, scale=(1.0, 1.1, 1.05), segs=24, rings=16, subsurf=1),
        cube((0.2, 0.06, 0.08), (0, -0.12, 0.06), D, bevel=0.02, subsurf=1),
        sphere(0.02, (-0.05, -0.145, 0.15), eye, segs=8, rings=6),
        sphere(0.02, (0.05, -0.145, 0.15), eye, segs=8, rings=6),
    ]
    # curved horns: overlapping tapered segments sweeping outward then up
    for sgn in (-1, 1):
        x, z, y, r = sgn * 0.1, 0.22, 0.0, 0.042
        for k in range(7):
            ang = 0.25 + k * 0.22
            step = 0.065
            nx, nz, ny = x + sgn * step * math.cos(ang), z + step * math.sin(ang), y - 0.006
            tilt = math.atan2(nx - x, nz - z)
            hs.append(cyl(r, r * 0.8, step * 1.35, ((x + nx) / 2, (y + ny) / 2, (z + nz) / 2), H, verts=10, rot=(0, tilt, 0)))
            x, z, y, r = nx, nz, ny, r * 0.8
        hs.append(cyl(r, 0.0, 0.06, (x + sgn * 0.01, y, z + 0.03), H, verts=8, rot=(0, sgn * 0.3, 0)))
    P['head'] = join(hs, 'head')
    us = [sphere(0.14, (0, 0, -0.01), A, scale=(1.1, 1.05, 0.9), cut=-0.15, segs=20, rings=12),
          cyl(0.06, 0.055, 0.3, (0, 0, -0.15), F, verts=12),
          cyl(0.07, 0.064, 0.17, (0, 0, -0.2), D, verts=14, bevel=0.005)]
    for a in range(3):
        us.append(cyl(0.025, 0.0, 0.14, (math.cos(a * 2.1) * 0.06, math.sin(a * 2.1) * 0.06, 0.1), D, verts=8,
                      rot=(math.sin(a * 2.1) * -0.5, math.cos(a * 2.1) * 0.5, 0)))
    P['uarm'] = join(us, 'uarm')
    P['farm'] = join([
        sphere(0.07, (0, 0, 0), D, segs=16, rings=10),
        cyl(0.062, 0.05, 0.25, (0, 0, -0.14), A, verts=14, bevel=0.006),
        cyl(0.02, 0.0, 0.1, (0, 0.07, -0.08), D, verts=8, rot=(math.radians(-70), 0, 0)),
    ], 'farm')
    P['hand'] = join([
        cyl(0.05, 0.055, 0.07, (0, 0, -0.02), D, verts=12, bevel=0.005),
        cube((0.08, 0.1, 0.09), (0, -0.005, -0.08), D, bevel=0.02, subsurf=1),
        cube((0.08, 0.04, 0.07), (0, -0.05, -0.12), A, bevel=0.012, subsurf=1),
    ], 'hand')
    P['thigh'] = join([cyl(0.08, 0.095, 0.44, (0, 0, -0.21), F, verts=14),
                       cyl(0.095, 0.08, 0.32, (0, -0.012, -0.19), A, verts=16, bevel=0.006)], 'thigh')
    P['shin'] = join([sphere(0.075, (0, -0.03, 0.0), D, segs=16, rings=10),
                      cyl(0.02, 0.0, 0.1, (0, -0.1, 0.0), D, verts=8, rot=(math.radians(90), 0, 0)),
                      cyl(0.058, 0.075, 0.42, (0, 0, -0.21), A, verts=16, bevel=0.006)], 'shin')
    P['foot'] = join([cube((0.12, 0.26, 0.09), (0, -0.05, -0.05), D, bevel=0.025, subsurf=1)], 'foot')
    return P


def bake_character(P, tag, size):
    objs = list(P.values())
    # lay the parts out in their rest pose (right side) so AO sees neighbouring parts
    for name, o in P.items():
        key = name if name in SKELETON else name + 'R'
        o.location = world_pos(key)
    uv_atlas(objs, margin=0.004)
    bake(objs, size, tag, ao_samples=64)
    for o in objs:
        o.location = (0, 0, 0)
    export(objs, tag)


if __name__ == '__main__':
    import sys
    which = sys.argv[1:] or ['hero', 'grunt', 'boss']
    if 'hero' in which:
        reset(); bake_character(build_hero(), 'hero', 2048)
    if 'grunt' in which:
        reset(); bake_character(build_grunt(), 'grunt', 1024)
    if 'boss' in which:
        reset(); bake_character(build_boss(), 'boss', 2048)
    with open(os.path.join(OUT, 'skeleton.json'), 'w') as f:
        json.dump(SKELETON, f)
