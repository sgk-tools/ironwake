"""Weapons: the hero's original greatsword plus enemy weapons. Origin = grip point held by the hand."""
import bpy, bmesh, math, random
from lib import *
from lib import _select, _set


def iron_mat(name, base=(0.05, 0.048, 0.047), rust=(0.11, 0.05, 0.028), edge=(0.32, 0.31, 0.3), rustiness=(0.6, 0.85)):
    def fuller(nt, v):
        # shallow central groove running along the blade (object X ~ 0, Z 0.35..1.45)
        sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(v, sep.inputs[0])
        ax = math_(nt, 'ABSOLUTE', sep.outputs[0])
        g = math_(nt, 'LESS_THAN', ax, 0.028)
        zin = math_(nt, 'MULTIPLY', math_(nt, 'GREATER_THAN', sep.outputs[2], 0.40), math_(nt, 'LESS_THAN', sep.outputs[2], 1.42))
        return math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', g, zin), -0.6)
    return pbr(name, base, rust, mscale=2.2, mrange=rustiness, r1=0.42, r2=0.88, m1=1.0, m2=0.15,
               bscale=35, bstr=0.1, edge=edge, erange=(0.56, 0.64), height=fuller, var=0.3)


def blade_mesh(name, outline, thick, inset):
    me = bpy.data.meshes.new(name)
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    vs = [bm.verts.new((x, 0, z)) for x, z in outline]
    f = bm.faces.new(vs)
    r = bmesh.ops.inset_region(bm, faces=[f], thickness=inset, depth=0)
    for v in f.verts:
        v.co.y = -thick
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    mm = o.modifiers.new('mir', 'MIRROR'); mm.use_axis = (False, True, False); mm.use_axis[0] = False
    mm.use_axis[1] = True; mm.use_bisect_axis[1] = False; mm.use_clip = True
    o = apply_all(o)
    _select([o]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0005); bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    return o


def hero_sword():
    """'Ironwake' - an original slab greatsword: chisel-clipped tip, breaker notch, riveted
    reinforcement plate, angled guard, leather grip and ring pommel."""
    iron = iron_mat('sw_iron')
    dark = pbr('sw_plate', (0.035, 0.032, 0.03), (0.1, 0.05, 0.03), mscale=3, mrange=(0.6, 0.85), r1=0.5, r2=0.85,
               m1=0.9, m2=0.3, bscale=50, bstr=0.12, edge=(0.25, 0.24, 0.23), erange=(0.57, 0.66))
    leather = pbr('sw_leather', (0.05, 0.03, 0.02), (0.11, 0.065, 0.035), mscale=6, r1=0.62, r2=0.8,
                  bscale=120, bstr=0.4, height=lambda nt, v: math_(nt, 'MULTIPLY', wave(nt, v, 22, 1.5), 0.8))
    W = 0.155
    outline = [(-W, 0.0), (W, 0.0), (W, 1.96), (-W, 1.66),
               (-W, 0.46), (-W + 0.055, 0.40), (-W + 0.055, 0.30), (-W, 0.24)]
    blade = blade_mesh('blade', outline, 0.024, 0.045)
    blade.data.materials.append(iron)
    _select([blade]); bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
    parts = [blade]
    # reinforcement plates + rivets
    for s in (-1, 1):
        parts.append(cube((0.25, 0.012, 0.2), (0.0, s * 0.026, 0.11), dark, bevel=0.004))
        for (x, z) in ((-0.08, 0.05), (0.08, 0.05), (-0.08, 0.17), (0.08, 0.17)):
            parts.append(sphere(0.014, (x, s * 0.033, z), dark, scale=(1, 0.6, 1), segs=10, rings=6))
    # guard: centre block + two angled arms
    parts.append(cube((0.13, 0.085, 0.07), (0, 0, -0.035), dark, bevel=0.01))
    for s in (-1, 1):
        parts.append(cube((0.17, 0.06, 0.05), (s * 0.13, 0, -0.055), dark, rot=(0, s * math.radians(18), 0), bevel=0.008))
    # grip with wrap ridges
    parts.append(cyl(0.026, 0.024, 0.46, (0, 0, -0.30), leather, verts=14))
    for i in range(9):
        parts.append(torus(0.027, 0.005, (0, 0, -0.10 - i * 0.046), leather, rot=(0, math.radians(8), 0)))
    # ring pommel
    parts.append(cyl(0.032, 0.03, 0.05, (0, 0, -0.55), dark, verts=12, bevel=0.005))
    parts.append(torus(0.055, 0.016, (0, 0, -0.63), dark, rot=(math.radians(90), 0, 0)))
    sw = join(parts, 'sword')
    # origin at the main hand position on the grip
    for v in sw.data.vertices:
        v.co.z += 0.16
    return sw


def grunt_sword():
    iron = iron_mat('gs_iron', base=(0.07, 0.065, 0.06), rust=(0.16, 0.07, 0.035), rustiness=(0.45, 0.7))
    wood = pbr('gs_wood', (0.07, 0.045, 0.03), (0.12, 0.08, 0.05), mscale=5, r1=0.75, r2=0.85, bscale=90, bstr=0.3,
               stretch=(1, 1, 0.15))
    outline = [(-0.035, 0.0), (0.035, 0.0), (0.03, 0.62), (0.0, 0.72), (-0.03, 0.62), (-0.038, 0.35)]
    b = blade_mesh('gblade', outline, 0.008, 0.012); b.data.materials.append(iron)
    _select([b]); bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
    parts = [b, cube((0.16, 0.03, 0.025), (0, 0, -0.012), iron, bevel=0.004),
             cyl(0.016, 0.016, 0.16, (0, 0, -0.1), wood, verts=8), sphere(0.024, (0, 0, -0.19), iron, segs=8, rings=6)]
    o = join(parts, 'gsword')
    for v in o.data.vertices:
        v.co.z += 0.06
    return o


def club():
    wood = pbr('cl_wood', (0.08, 0.05, 0.03), (0.13, 0.09, 0.055), mscale=4, r1=0.75, r2=0.9, bscale=60, bstr=0.4,
               stretch=(1, 1, 0.2))
    iron = iron_mat('cl_iron', base=(0.06, 0.055, 0.05), rustiness=(0.3, 0.5))
    parts = [cyl(0.03, 0.075, 0.95, (0, 0, 0.35), wood, verts=10, subsurf=1)]
    for i, z in enumerate((0.55, 0.7)):
        parts.append(cyl(0.08, 0.08, 0.05, (0, 0, z), iron, verts=12))
    random.seed(3)
    for i in range(10):
        a = random.uniform(0, 6.28); z = random.uniform(0.5, 0.8)
        parts.append(cyl(0.012, 0.0, 0.07, (math.cos(a) * 0.08, math.sin(a) * 0.08, z), iron, verts=6,
                         rot=(math.sin(a) * 1.57 * -1, math.cos(a) * 1.57, 0)))
    o = join(parts, 'club')
    for v in o.data.vertices:
        v.co.z += 0.12
    return o


def boss_axe():
    iron = iron_mat('ax_iron', base=(0.03, 0.028, 0.03), rust=(0.15, 0.04, 0.03), edge=(0.5, 0.45, 0.43), rustiness=(0.55, 0.75))
    wood = pbr('ax_haft', (0.03, 0.02, 0.018), (0.07, 0.04, 0.03), mscale=5, r1=0.6, r2=0.8, bscale=80, bstr=0.3,
               stretch=(1, 1, 0.2))
    outline = [(0.03, 0.0), (0.2, -0.14), (0.42, -0.2), (0.5, 0.05), (0.47, 0.3), (0.42, 0.55), (0.2, 0.42), (0.03, 0.3)]
    head = blade_mesh('axhead', outline, 0.03, 0.06); head.data.materials.append(iron)
    _select([head]); bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
    for v in head.data.vertices:
        v.co.z += 0.95
    parts = [head, cyl(0.03, 0.028, 1.6, (0, 0, 0.4), wood, verts=10),
             cyl(0.045, 0.045, 0.4, (0, 0, 1.1), iron, verts=10, bevel=0.005),
             cyl(0.04, 0.0, 0.3, (0, 0, 1.45), iron, verts=8)]
    o = join(parts, 'bossaxe')
    for v in o.data.vertices:
        v.co.z += 0.1
    return o


if __name__ == '__main__':
    reset()
    sw = hero_sword(); uv_atlas([sw]); bake([sw], 1024, 'sword'); export([sw], 'sword')
    reset()
    objs = [grunt_sword(), club(), boss_axe()]
    for i, o in enumerate(objs):
        o.location.x = i * 1.5
    uv_atlas(objs); bake(objs, 1024, 'eweap')
    for o in objs:
        o.location.x = 0
    export(objs, 'weapons')
