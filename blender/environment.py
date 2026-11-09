"""Battlefield environment: tileable ground textures, props and an equirectangular dusk sky."""
import bpy, bmesh, math, random, os
import numpy as np
from lib import *
from lib import _select, _img


def seamless(arr):
    h, w = arr.shape[:2]
    rolled = np.roll(np.roll(arr, h // 2, 0), w // 2, 1)
    y = np.minimum(np.arange(h), h - 1 - np.arange(h)) / (h / 2)
    x = np.minimum(np.arange(w), w - 1 - np.arange(w)) / (w / 2)
    m = np.clip(np.minimum.outer(y, x) * 2.2, 0, 1)[..., None]
    m = m * m * (3 - 2 * m)
    return arr * m + rolled * (1 - m)


def ground():
    reset()
    bpy.ops.mesh.primitive_plane_add(size=6)
    pl = bpy.context.active_object
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.subdivide(number_cuts=60); bpy.ops.object.mode_set(mode='OBJECT')

    def height(nt, v):
        stones = ramp(nt, voronoi(nt, v, 6, 'Distance'), 0.0, 0.35, (1, 1, 1, 1), (0, 0, 0, 1))
        stones = math_(nt, 'MULTIPLY', stones, ramp(nt, noise(nt, v, 3, 2), 0.45, 0.55))
        ruts = math_(nt, 'MULTIPLY', wave(nt, v, 1.4, 6), 0.4)
        return math_(nt, 'ADD', math_(nt, 'MULTIPLY', stones, 2.0), ruts)
    m = pbr('mud', (0.095, 0.075, 0.058), (0.032, 0.027, 0.022), mscale=1.2, mrange=(0.42, 0.6), r1=0.88, r2=0.6,
            bscale=24, bstr=0.6, height=height, var=0.45)
    # sparse dead grass tint + stone colour layered in the colour channel
    nt = m.node_tree
    v = coords(nt)
    grass = ramp(nt, noise(nt, v, 2.2, 6, 0.7), 0.5, 0.62)
    blades = ramp(nt, wave(nt, coords(nt, (1, 30, 1)), 30, 8), 0.4, 0.9)
    gmask = math_(nt, 'MULTIPLY', grass, blades, clamp=True)
    stone = ramp(nt, voronoi(nt, v, 6, 'Distance'), 0.0, 0.3, (1, 1, 1, 1), (0, 0, 0, 1))
    stone = math_(nt, 'MULTIPLY', stone, ramp(nt, noise(nt, v, 3, 2), 0.45, 0.55))
    c = mix(nt, gmask, CH['mud']['color'], (0.15, 0.125, 0.06))
    c = mix(nt, stone, c, (0.2, 0.19, 0.18))
    blood = ramp(nt, noise(nt, v, 0.9, 5, 0.55), 0.72, 0.78)
    c = mix(nt, math_(nt, 'MULTIPLY', blood, 0.7), c, (0.06, 0.008, 0.006))
    CH['mud']['color'] = c
    nt.links.new(c, CH['mud']['bsdf'].inputs['Base Color'])
    pl.data.materials.append(m)
    size = 1024
    ims = {k: _img('g_' + k, size, k != 'col') for k in ('col', 'nrm', 'rough')}
    t = nt.nodes.new('ShaderNodeTexImage'); nt.nodes.active = t
    sc = bpy.context.scene
    for k, kind, src in (('col', 'EMIT', 'color'), ('rough', 'EMIT', 'rough'), ('nrm', 'NORMAL', None)):
        t.image = ims[k]
        e = None
        if src:
            e = nt.nodes.new('ShaderNodeEmission'); nt.links.new(CH['mud'][src], e.inputs[0])
            nt.links.new(e.outputs[0], CH['mud']['out'].inputs['Surface'])
        _select([pl]); bpy.ops.object.bake(type=kind, margin=4, use_clear=True)
        if e:
            nt.nodes.remove(e)
        nt.links.new(CH['mud']['bsdf'].outputs[0], CH['mud']['out'].inputs['Surface'])
    for k in ('col', 'nrm', 'rough'):
        a = np.empty(size * size * 4, np.float32); ims[k].pixels.foreach_get(a)
        a = seamless(a.reshape(size, size, 4))
        a[..., 3] = 1
        ims[k].pixels.foreach_set(a.astype(np.float32).ravel())
        ims[k].filepath_raw = os.path.join(OUT, f'ground_{k}.jpg'); ims[k].file_format = 'JPEG'
        sc.render.image_settings.quality = 85
        ims[k].save()
    print('ground done')


def rock_mat():
    return pbr('rock', (0.11, 0.1, 0.095), (0.05, 0.05, 0.04), mscale=2.5, mrange=(0.4, 0.7), r1=0.85, r2=0.95,
               bscale=14, bstr=0.5, edge=(0.2, 0.19, 0.18), erange=(0.52, 0.6),
               height=lambda nt, v: math_(nt, 'MULTIPLY', voronoi(nt, v, 5, 'Distance'), 1.5))


def rock(seed, size):
    random.seed(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=1)
    o = bpy.context.active_object
    o.scale = size
    tex = bpy.data.textures.new(f'rk{seed}', 'VORONOI'); tex.noise_scale = 0.9
    d = o.modifiers.new('d', 'DISPLACE'); d.texture = tex; d.strength = 0.35; d.texture_coords = 'OBJECT'
    tex2 = bpy.data.textures.new(f'rn{seed}', 'CLOUDS'); tex2.noise_scale = 0.35
    d2 = o.modifiers.new('d2', 'DISPLACE'); d2.texture = tex2; d2.strength = 0.18
    o = apply_all(o)
    # flatten the bottom so it sits on the ground
    for v in o.data.vertices:
        if v.co.z < -0.1 * size[2]:
            v.co.z = -0.1 * size[2] + (v.co.z + 0.1 * size[2]) * 0.15
    o = decimate(o, 0.18)
    o.data.materials.append(rock_mat() if not bpy.data.materials.get('rock') else bpy.data.materials['rock'])
    _select([o]); bpy.ops.object.shade_smooth()
    o.name = o.data.name = f'rock{seed}'
    return o


def dead_tree(seed):
    random.seed(seed)
    bark = bpy.data.materials.get('bark') or pbr('bark', (0.05, 0.042, 0.036), (0.1, 0.09, 0.08), mscale=3, r1=0.85, r2=0.95,
                                                  bscale=30, bstr=0.6, stretch=(1, 1, 0.12),
                                                  height=lambda nt, v: math_(nt, 'MULTIPLY', wave(nt, coords(nt, (1, 1, 0.1)), 12, 8), 0.8))
    me = bpy.data.meshes.new('tree'); o = bpy.data.objects.new(f'tree{seed}', me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    radii = {}

    def branch(p, d, length, depth, r):
        v0 = p
        segs = 4
        for i in range(segs):
            d = (d + Vector((random.uniform(-.3, .3), random.uniform(-.3, .3), random.uniform(-.05, .15)))).normalized()
            np_ = v0.co + d * (length / segs)
            v1 = bm.verts.new(np_); bm.edges.new((v0, v1))
            radii[v1] = r * (1 - (i + 1) / segs * 0.5)
            if depth > 0 and i >= 1 and random.random() < 0.55:
                nd = (d + Vector((random.uniform(-1, 1), random.uniform(-1, 1), 0.3))).normalized()
                branch(v1, nd, length * 0.55, depth - 1, radii[v1] * 0.6)
            v0 = v1
    root = bm.verts.new((0, 0, -0.2)); radii[root] = 0.22
    branch(root, Vector((0, 0, 1)), random.uniform(4.0, 5.5), 2, 0.2)
    bm.to_mesh(me)
    skin = o.modifiers.new('sk', 'SKIN')
    for i, v in enumerate(bm.verts):
        me.skin_vertices[0].data[i].radius = (radii.get(v, 0.05),) * 2
    bm.free()
    o.modifiers.new('ss', 'SUBSURF').levels = 1
    o.data.materials.append(bark)
    o = apply_all(o)
    o = decimate(o, 0.5)
    _select([o]); bpy.ops.object.shade_smooth()
    o.name = o.data.name = f'tree{seed}'
    return o


def spear():
    wood = bpy.data.materials.get('bark')
    iron = pbr('pr_iron', (0.06, 0.055, 0.05), (0.16, 0.07, 0.035), mscale=3, mrange=(0.3, 0.6), r1=0.5, r2=0.9, m1=1, m2=0.2,
               bscale=50, bstr=0.15)
    p = [cyl(0.025, 0.022, 1.6, (0, 0, 0.6), wood, verts=8), cyl(0.03, 0.0, 0.3, (0, 0, 1.55), iron, verts=6)]
    o = join(p, 'spear')
    return o


def banner():
    wood = bpy.data.materials.get('bark')
    rag = pbr('banner_cloth', (0.12, 0.02, 0.018), (0.04, 0.02, 0.02), mscale=3, mrange=(0.4, 0.7), r1=0.92, bscale=120, bstr=0.25,
              double=True)
    pole = cyl(0.035, 0.03, 3.4, (0, 0, 1.5), wood, verts=8)
    bar = cyl(0.025, 0.025, 1.0, (0.45, 0, 3.0), wood, verts=8, rot=(0, math.radians(90), 0))
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=8, y_subdivisions=12, size=1)
    cl = bpy.context.active_object
    random.seed(11)
    bm = bmesh.new(); bm.from_mesh(cl.data)
    for v in bm.verts:
        u, t = v.co.x + 0.5, v.co.y + 0.5
        v.co = Vector((0.05 + u * 0.85, 0.06 * math.sin(u * 7 + t * 3), 3.0 - (1 - t) * 1.6))
    kill = [f for f in bm.faces if f.calc_center_median().z < 1.75 and random.random() < 0.5]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(cl.data); bm.free()
    cl.modifiers.new('so', 'SOLIDIFY').thickness = 0.01
    cl.data.materials.append(rag)
    cl = apply_all(cl)
    return join([pole, bar, cl], 'banner')


def pillar():
    m = bpy.data.materials.get('rock')
    p = [cyl(0.42, 0.38, 2.6, (0, 0, 1.3), m, verts=14, bevel=0.03)]
    p.append(cube((1.0, 1.0, 0.3), (0, 0, 0.15), m, bevel=0.04))
    o = join(p, 'pillar')
    bm = bmesh.new(); bm.from_mesh(o.data)
    random.seed(5)
    for v in bm.verts:  # broken, uneven top
        if v.co.z > 2.4:
            v.co.z -= random.uniform(0, 0.8)
    bm.to_mesh(o.data); bm.free()
    return o


def props():
    reset()
    objs = [rock(1, (1.4, 1.1, 0.9)), rock(2, (0.8, 0.7, 0.5)), rock(3, (2.2, 1.6, 1.4)),
            dead_tree(4), dead_tree(9), spear(), banner(), pillar()]
    x = 0
    for o in objs:
        o.location.x = x; x += 6
    uv_atlas(objs, margin=0.004)
    bake(objs, 2048, 'props', ao_samples=48, ao_strength=0.5)
    for o in objs:
        o.location = (0, 0, 0)
    export(objs, 'props')


def sky():
    reset()
    sc = bpy.context.scene
    w = bpy.data.worlds.new('sky'); sc.world = w
    w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground'); nt.links.new(bg.outputs[0], out.inputs[0])
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    zr = nt.nodes.new('ShaderNodeMapRange'); nt.links.new(sep.outputs[2], zr.inputs[0])
    zr.inputs[1].default_value = -1; zr.inputs[2].default_value = 1
    z = zr.outputs[0]
    # vertical gradient: blood-red horizon -> bruised violet -> near-black zenith
    g = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(z, g.inputs[0])
    e = g.color_ramp.elements
    e[0].position = 0.0; e[0].color = (0.02, 0.008, 0.008, 1)
    e[1].position = 1.0; e[1].color = (0.004, 0.004, 0.008, 1)
    for pos, col in ((0.47, (0.05, 0.012, 0.01, 1)), (0.5, (0.42, 0.08, 0.03, 1)), (0.53, (0.16, 0.035, 0.028, 1)),
                     (0.65, (0.03, 0.013, 0.018, 1))):
        el = g.color_ramp.elements.new(pos); el.color = col
    # low red sun glow toward -Y, just above the horizon
    sun_dir = Vector((0.0, -1.0, 0.12)).normalized()
    dp = nt.nodes.new('ShaderNodeVectorMath'); dp.operation = 'DOT_PRODUCT'
    nt.links.new(tc.outputs['Generated'], dp.inputs[0]); dp.inputs[1].default_value = sun_dir
    dpos = nt.nodes.new('ShaderNodeMath'); dpos.operation = 'MAXIMUM'; dpos.inputs[1].default_value = 0.0
    nt.links.new(dp.outputs['Value'], dpos.inputs[0])
    glow = nt.nodes.new('ShaderNodeMath'); glow.operation = 'POWER'
    nt.links.new(dpos.outputs[0], glow.inputs[0]); glow.inputs[1].default_value = 10
    glow2 = nt.nodes.new('ShaderNodeMath'); glow2.operation = 'POWER'
    nt.links.new(dpos.outputs[0], glow2.inputs[0]); glow2.inputs[1].default_value = 900
    # clouds
    nm = nt.nodes.new('ShaderNodeMapping'); nt.links.new(tc.outputs['Generated'], nm.inputs[0]); nm.inputs['Scale'].default_value = (1, 1, 5)
    nz = nt.nodes.new('ShaderNodeTexNoise'); nt.links.new(nm.outputs[0], nz.inputs['Vector'])
    nz.inputs['Scale'].default_value = 2.2; nz.inputs['Detail'].default_value = 5; nz.inputs['Roughness'].default_value = 0.62
    nz.inputs['Distortion'].default_value = 0.6
    cr = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(nz.outputs['Fac'], cr.inputs[0])
    cr.color_ramp.elements[0].position = 0.45; cr.color_ramp.elements[1].position = 0.75
    band = nt.nodes.new('ShaderNodeMapRange'); nt.links.new(z, band.inputs[0])
    band.inputs[1].default_value = 0.5; band.inputs[2].default_value = 0.85
    band.inputs[3].default_value = 1; band.inputs[4].default_value = 0.1

    def M(op, a, b):
        n = nt.nodes.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = op; n.clamp_factor = True
        ins = [s for s in n.inputs if s.enabled]
        ins[0].default_value = 1.0
        for s, val in ((ins[1], a), (ins[2], b)):
            if isinstance(val, bpy.types.NodeSocket): nt.links.new(val, s)
            else: s.default_value = val
        return [s for s in n.outputs if s.enabled][0]
    sunc = M('MULTIPLY', glow.outputs[0], (1.0, 0.35, 0.1, 1))
    core = M('MULTIPLY', glow2.outputs[0], (6.0, 3.0, 1.4, 1))
    col = M('ADD', g.outputs[0], sunc)
    col = M('ADD', col, core)
    cm = nt.nodes.new('ShaderNodeMath'); cm.operation = 'MULTIPLY'
    nt.links.new(cr.outputs[0], cm.inputs[0]); nt.links.new(band.outputs[0], cm.inputs[1])
    dark = nt.nodes.new('ShaderNodeMix'); dark.data_type = 'RGBA'; dark.clamp_factor = True
    di = [s for s in dark.inputs if s.enabled]
    nt.links.new(cm.outputs[0], di[0]); nt.links.new(col, di[1]); di[2].default_value = (0.012, 0.006, 0.007, 1)
    nt.links.new([s for s in dark.outputs if s.enabled][0], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.0
    cam = bpy.data.cameras.new('pano'); cam.type = 'PANO'
    try:
        cam.panorama_type = 'EQUIRECTANGULAR'
    except Exception:
        cam.cycles.panorama_type = 'EQUIRECTANGULAR'
    co = bpy.data.objects.new('pano', cam); sc.collection.objects.link(co)
    co.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = co
    sc.render.resolution_x = 2048; sc.render.resolution_y = 1024
    sc.cycles.samples = 8
    sc.view_settings.view_transform = 'AgX'
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 88
    sc.render.filepath = os.path.join(OUT, 'sky.jpg')
    bpy.ops.render.render(write_still=True)
    print('sky done')


if __name__ == '__main__':
    import sys
    which = sys.argv[1:] or ['ground', 'props', 'sky']
    if 'ground' in which: ground()
    if 'props' in which: props()
    if 'sky' in which: sky()
