import * as THREE from 'three';

/** Cheap 3D value noise. Object space on the hand is millimetres, so a
 * frequency around 0.5 puts the grain just under a millimetre — pores, not
 * sandpaper. */
const SKIN_NOISE = `
float skinHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float skinNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(skinHash(i), skinHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(skinHash(i + vec3(0.0, 1.0, 0.0)), skinHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(skinHash(i + vec3(0.0, 0.0, 1.0)), skinHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(skinHash(i + vec3(0.0, 1.0, 1.0)), skinHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
`;

/** Skin without subsurface scattering is the hardest material to fake in a
 * forward renderer. This leans on three cheap tricks that together survive the
 * site's low-key grade: pore-scale normal perturbation, roughness breakup so
 * the highlights are not mirror-smooth, and a warm fresnel bleed that stands in
 * for light scattering under the skin.
 *
 * Base colour is sampled from the sculpt's own hand_map.jpg rather than
 * invented: the painted skin ranges #73392e (shadow) to #9c5a58 (light) with a
 * mean of #8a4f45. Keeping that hue is what stops the hand reading as stone
 * under the warm studio key. */
export function createSkinMaterial(): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#8a5146'),
    roughness: 0.66,
    metalness: 0,
    sheen: 0.12,
    sheenColor: new THREE.Color('#c98a6a'),
    sheenRoughness: 0.72,
    envMapIntensity: 0.24,
  });

  material.customProgramCacheKey = () => 'bookln-skin';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkinPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinPosition = position;');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSkinPosition;\n${SKIN_NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // Mottling at three scales keeps the albedo from reading as a flat
          // plastic tint; the amplitudes stay under 10% so the texture tone
          // survives the grade.
          float skinTone = skinNoise(vSkinPosition * 0.22) * 0.6
                         + skinNoise(vSkinPosition * 0.9) * 0.4;
          diffuseColor.rgb *= 0.9 + skinTone * 0.2;
        }`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        {
          const float eps = 0.4;
          vec3 skinSamplePos = vSkinPosition * 0.5;
          float base = skinNoise(skinSamplePos);
          vec3 grad = vec3(
            skinNoise(skinSamplePos + vec3(eps, 0.0, 0.0)) - base,
            skinNoise(skinSamplePos + vec3(0.0, eps, 0.0)) - base,
            skinNoise(skinSamplePos + vec3(0.0, 0.0, eps)) - base
          ) / eps;
          normal = normalize(normal + (viewMatrix * vec4(grad, 0.0)).xyz * 0.09);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(
          roughnessFactor + (skinNoise(vSkinPosition * 1.9) - 0.5) * 0.2,
          0.25,
          1.0
        );`,
      )
      .replace(
        '#include <opaque_fragment>',
        `float skinRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.6);
        outgoingLight += vec3(1.0, 0.5, 0.3) * skinRim * 0.2;
        #include <opaque_fragment>`,
      );
  };

  return material;
}
