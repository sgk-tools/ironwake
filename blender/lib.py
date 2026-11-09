"""Shared helpers for building, baking and exporting assets with Blender (bpy 5.2)."""
import bpy, bmesh, math, os, random
import numpy as np
from mathutils import Vector

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'assets'))
TEX = os.path.join(os.path.dirname(__file__), '..', 'build_tex')
os.makedirs(OUT, exist_ok=True)
os.makedirs(TEX, exist_ok=True)

CH = {}  # material name -> channel sockets


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 1
    sc.render.bake.margin = 6
    CH.clear()


# ---------------------------------------------------------------- objects
def _select(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def apply_all(o):
    _select([o])
    bpy.ops.object.convert(target='MESH')
    return bpy.context.view_layer.objects.active


def _finish(o, mat, bevel=0, subsurf=0, smooth=True):
    if mat:
        o.data.materials.append(mat)
    if bevel:
        m = o.modifiers.new('bv', 'BEVEL'); m.width = bevel; m.segments = 2
        m.limit_method = 'ANGLE'
    if subsurf:
        m = o.modifiers.new('ss', 'SUBSURF'); m.levels = subsurf; m.render_levels = subsurf
    o = apply_all(o)
    if smooth:
        _select([o])
        try:
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))
        except Exception:
            bpy.ops.object.shade_smooth()
    return o


def cube(size, loc=(0, 0, 0), mat=None, rot=(0, 0, 0), bevel=0.01, subsurf=0, smooth=True):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    _select([o]); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(o, mat, bevel, subsurf, smooth)


def cyl(r1, r2, depth, loc=(0, 0, 0), mat=None, rot=(0, 0, 0), verts=16, bevel=0.0, subsurf=0, scale=None, smooth=True):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    if scale:
        o.scale = scale
        _select([o]); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(o, mat, bevel, subsurf, smooth)


def sphere(r, loc=(0, 0, 0), mat=None, scale=(1, 1, 1), rot=(0, 0, 0), segs=20, rings=12, cut=None, subsurf=0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=r, location=(0, 0, 0))
    o = bpy.context.active_object
    if cut is not None:  # keep only verts with z >= cut*r (dome)
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < cut * r - 1e-4], context='VERTS')
        bm.to_mesh(o.data); bm.free()
        m = o.modifiers.new('so', 'SOLIDIFY'); m.thickness = r * 0.08
    o.scale = scale; o.rotation_euler = rot; o.location = loc
    _select([o]); bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return _finish(o, mat, 0, subsurf, True)


def torus(R, r, loc=(0, 0, 0), mat=None, rot=(0, 0, 0), scale=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=24, minor_segments=8, location=loc, rotation=rot)
    o = bpy.context.active_object
    if scale:
        o.scale = scale
        _select([o]); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(o, mat, 0, 0, True)


def join(objs, name):
    _select(objs)
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name; o.data.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    _select([o]); bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return o


def decimate(o, ratio):
    if ratio >= 1:
        return o
    m = o.modifiers.new('dc', 'DECIMATE'); m.ratio = ratio
    return apply_all(o)


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


# ---------------------------------------------------------------- shader nodes
def _set(nt, sock, val):
    if isinstance(val, bpy.types.NodeSocket):
        nt.links.new(val, sock)
    else:
        if isinstance(val, (tuple, list)) and len(val) == 3 and len(sock.default_value) == 4:
            val = (*val, 1.0)
        sock.default_value = val


def _en(sockets):
    return [s for s in sockets if s.enabled]


def mix(nt, fac, a, b, kind='RGBA', blend='MIX'):
    n = nt.nodes.new('ShaderNodeMix'); n.data_type = kind
    if kind == 'RGBA':
        n.blend_type = blend
    n.clamp_factor = True
    ins = _en(n.inputs)
    _set(nt, ins[0], fac); _set(nt, ins[1], a); _set(nt, ins[2], b)
    return _en(n.outputs)[0]


def math_(nt, op, a, b=0.0, clamp=False):
    n = nt.nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
    _set(nt, n.inputs[0], a); _set(nt, n.inputs[1], b)
    return n.outputs[0]


def lerp(nt, fac, a, b):
    return mix(nt, fac, a, b, kind='FLOAT')


def ramp(nt, fac, p0, p1, c0=(0, 0, 0, 1), c1=(1, 1, 1, 1)):
    n = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(fac, n.inputs[0])
    e = n.color_ramp.elements
    e[0].position = p0; e[0].color = c0
    e[1].position = p1; e[1].color = c1
    return n.outputs[0]


def coords(nt, stretch=None, offset=None):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    s = tc.outputs['Object']
    if stretch or offset:
        mp = nt.nodes.new('ShaderNodeMapping')
        nt.links.new(s, mp.inputs['Vector'])
        if stretch: mp.inputs['Scale'].default_value = stretch
        if offset: mp.inputs['Location'].default_value = offset
        s = mp.outputs[0]
    return s


def noise(nt, vec, scale, detail=6.0, rough=0.6, distort=0.0):
    n = nt.nodes.new('ShaderNodeTexNoise')
    nt.links.new(vec, n.inputs['Vector'])
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    n.inputs['Distortion'].default_value = distort
    return n.outputs['Fac']


def voronoi(nt, vec, scale, out='Distance'):
    n = nt.nodes.new('ShaderNodeTexVoronoi')
    nt.links.new(vec, n.inputs['Vector'])
    n.inputs['Scale'].default_value = scale
    return n.outputs[out]


def wave(nt, vec, scale, distort=2.0, kind='BANDS'):
    n = nt.nodes.new('ShaderNodeTexWave'); n.wave_type = kind
    nt.links.new(vec, n.inputs['Vector'])
    n.inputs['Scale'].default_value = scale
    n.inputs['Distortion'].default_value = distort
    return n.outputs['Fac']


def pbr(name, c1, c2=None, mscale=3.0, mrange=(0.45, 0.65), r1=0.5, r2=None, m1=0.0, m2=None,
        bscale=40.0, bstr=0.2, edge=None, erange=(0.52, 0.6), stretch=None, height=None,
        emit=None, var=0.35, double=False):
    """Procedural PBR material whose colour/roughness/metal sockets are recorded for baking."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = not double
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    v = coords(nt, stretch)
    mask = ramp(nt, noise(nt, v, mscale, 8, 0.62), *mrange) if c2 is not None else None
    maskf = math_(nt, 'MULTIPLY', mask, 1.0) if mask is not None else 0.0
    col = mix(nt, maskf, c1, c2) if c2 is not None else mix(nt, 0.0, c1, c1)
    # tonal variation
    vn = noise(nt, v, mscale * 4.0, 4, 0.5)
    vf = lerp(nt, vn, 1.0 - var, 1.0 + var * 0.6)
    col = mix(nt, 1.0, col, mix(nt, 0.0, (1, 1, 1), (1, 1, 1)), blend='MULTIPLY')
    col = mix(nt, 1.0, col, _gray(nt, vf), blend='MULTIPLY')
    rough = lerp(nt, maskf, r1, r2 if r2 is not None else r1)
    metal = lerp(nt, maskf, m1, m2 if m2 is not None else m1)
    if edge is not None:
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        em = ramp(nt, geo.outputs['Pointiness'], *erange)
        brk = ramp(nt, noise(nt, v, 18, 4, 0.7), 0.35, 0.6)
        emf = math_(nt, 'MULTIPLY', em, brk, clamp=True)
        col = mix(nt, emf, col, edge)
        rough = lerp(nt, emf, rough, 0.3)
        metal = lerp(nt, emf, metal, 1.0 if (m1 or 0) > 0.3 else metal)
    h = noise(nt, v, bscale, 8, 0.65)
    if mask is not None:
        h = math_(nt, 'ADD', h, math_(nt, 'MULTIPLY', maskf, 0.35))
    if height is not None:
        h = math_(nt, 'ADD', h, height(nt, v))
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = bstr
    bump.inputs['Distance'].default_value = 0.02
    nt.links.new(h, bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    nt.links.new(col, bsdf.inputs['Base Color'])
    nt.links.new(rough, bsdf.inputs['Roughness'])
    nt.links.new(metal, bsdf.inputs['Metallic'])
    em_sock = None
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = (*emit[0], 1)
        bsdf.inputs['Emission Strength'].default_value = emit[1]
        em_sock = True
    CH[m.name] = dict(color=col, rough=rough, metal=metal, bsdf=bsdf, out=out, emit=emit)
    return m


def _gray(nt, f):
    n = nt.nodes.new('ShaderNodeCombineColor')
    for i in range(3):
        nt.links.new(f, n.inputs[i])
    return n.outputs[0]


# ---------------------------------------------------------------- UV + bake
def uv_atlas(objs, margin=0.006):
    _select(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0)
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def _img(name, size, noncolor):
    im = bpy.data.images.new(name, size, size, alpha=False)
    if noncolor:
        im.colorspace_settings.name = 'Non-Color'
    return im


def bake(objs, size, tag, ao_samples=48, ao_strength=0.65, extra_hidden=()):
    """Bake albedo(+AO), ORM and tangent normal into one atlas shared by objs. Returns final material."""
    sc = bpy.context.scene
    mats = []
    for o in objs:
        for mt in o.data.materials:
            if mt and mt not in mats:
                mats.append(mt)
    tex = {}
    for mt in mats:
        t = mt.node_tree.nodes.new('ShaderNodeTexImage'); tex[mt.name] = t
        mt.node_tree.nodes.active = t
    imgs = {k: _img(f'{tag}_{k}', size, k != 'col') for k in ('col', 'rough', 'metal', 'nrm', 'ao')}

    def run(kind, img, src=None, samples=1):
        sc.cycles.samples = samples
        ems = []
        for mt in mats:
            tex[mt.name].image = img
            nt = mt.node_tree
            if src:
                e = nt.nodes.new('ShaderNodeEmission'); ems.append((nt, e))
                s = CH[mt.name][src]
                nt.links.new(s, e.inputs['Color'])
                nt.links.new(e.outputs[0], CH[mt.name]['out'].inputs['Surface'])
        _select(objs)
        bpy.ops.object.bake(type=kind, margin=6, use_clear=True, normal_space='TANGENT')
        for nt, e in ems:
            nt.nodes.remove(e)
        for mt in mats:
            mt.node_tree.links.new(CH[mt.name]['bsdf'].outputs['BSDF'], CH[mt.name]['out'].inputs['Surface'])

    run('EMIT', imgs['col'], 'color')
    run('EMIT', imgs['rough'], 'rough')
    run('EMIT', imgs['metal'], 'metal')
    run('NORMAL', imgs['nrm'])
    run('AO', imgs['ao'], samples=ao_samples)

    def px(im):
        a = np.empty(size * size * 4, dtype=np.float32); im.pixels.foreach_get(a)
        return a.reshape(size, size, 4)
    col, rough, metal, ao = px(imgs['col']), px(imgs['rough']), px(imgs['metal']), px(imgs['ao'])
    aof = (1.0 - ao_strength) + ao_strength * ao[..., :1]
    col[..., :3] *= aof ** 0.4545
    orm = np.ones_like(col)
    orm[..., 0] = ao[..., 0]; orm[..., 1] = rough[..., 0]; orm[..., 2] = metal[..., 0]
    out = {}
    for k, arr, nc in (('col', col, False), ('orm', orm, True), ('nrm', px(imgs['nrm']), True)):
        im = _img(f'{tag}_{k}_final', size, nc)
        im.pixels.foreach_set(np.clip(arr, 0, 1).ravel())
        path = os.path.abspath(os.path.join(TEX, f'{tag}_{k}.png'))
        im.filepath_raw = path; im.file_format = 'PNG'; im.save()
        out[k] = im
    # emissive mask (e.g. glowing eyes) baked separately if any material emits
    emitters = [mt for mt in mats if CH[mt.name]['emit']]
    emimg = None
    if emitters:
        emimg = _img(f'{tag}_emit', size, False)
        for mt in mats:
            nt = mt.node_tree
            c = CH[mt.name]['emit']
            e = nt.nodes.new('ShaderNodeEmission')
            e.inputs['Color'].default_value = (*c[0], 1) if c else (0, 0, 0, 1)
            nt.links.new(e.outputs[0], CH[mt.name]['out'].inputs['Surface'])
            tex[mt.name].image = emimg
        _select(objs)
        sc.cycles.samples = 1
        bpy.ops.object.bake(type='EMIT', margin=6, use_clear=True)
        path = os.path.abspath(os.path.join(TEX, f'{tag}_emit.png'))
        emimg.filepath_raw = path; emimg.file_format = 'PNG'; emimg.save()
    fm = final_material(tag, out['col'], out['orm'], out['nrm'], emimg,
                        double=any(not mt.use_backface_culling for mt in mats))
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(fm)
        for p in o.data.polygons:
            p.material_index = 0
    return fm


def final_material(tag, col, orm, nrm, emit=None, double=False):
    m = bpy.data.materials.new(tag)
    m.use_nodes = True
    m.use_backface_culling = not double
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], out.inputs['Surface'])
    tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = col
    nt.links.new(tc.outputs['Color'], b.inputs['Base Color'])
    to = nt.nodes.new('ShaderNodeTexImage'); to.image = orm
    sp = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(to.outputs['Color'], sp.inputs[0])
    nt.links.new(sp.outputs[1], b.inputs['Roughness'])
    nt.links.new(sp.outputs[2], b.inputs['Metallic'])
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = nrm
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if emit is not None:
        te = nt.nodes.new('ShaderNodeTexImage'); te.image = emit
        nt.links.new(te.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = 1.0
    return m


def export(objs, name):
    _select(objs)
    path = os.path.join(OUT, name + '.glb')
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
              export_yup=True, export_animations=False, export_image_format='JPEG')
    try:
        bpy.ops.export_scene.gltf(**kw, export_image_quality=86)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    print('exported', name, os.path.getsize(path) // 1024, 'KB', 'tris', sum(tris(o) for o in objs))
