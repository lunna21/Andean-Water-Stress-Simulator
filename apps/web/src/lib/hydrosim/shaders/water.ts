export const MAX_RIPPLES = 12;

export const WATER_SURFACE_VERTEX = `
  attribute float aShore;
  attribute float aDepth;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;
  varying float vShore;
  varying float vWaterDepth;

  void main() {
    vUv = uv;
    vLocalPosition = position;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vShore = aShore;
    vWaterDepth = aDepth;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const WATER_SURFACE_FRAGMENT = `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uRippleLife;
  uniform float uRippleStrength;
  uniform float uRippleSpeed;
  uniform float uWaveAmp;
  uniform float uFresnelStrength;
  uniform float uDepthRange;
  uniform vec2 uBounds;
  uniform vec3 uBaseColor;
  uniform vec3 uDeepColor;
  uniform vec2 uRippleCenters[${MAX_RIPPLES}];
  uniform float uRippleTimes[${MAX_RIPPLES}];

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;
  varying float vShore;
  varying float vWaterDepth;

  float rippleHeight(vec2 pos) {
    float height = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      float age = uTime - uRippleTimes[i];
      float isActive = step(0.0, age) * step(age, uRippleLife);
      float dist = length(pos - uRippleCenters[i]);
      float wave = sin((dist - age * uRippleSpeed) * 12.0);
      float falloff = exp(-dist * 3.4) * exp(-age * 1.1);
      height += wave * falloff * uRippleStrength * isActive;
    }
    float noise = sin(pos.x * 6.2 + uTime * 0.6) * sin(pos.y * 5.1 + uTime * 0.4);
    height += noise * uWaveAmp;
    return height;
  }

  void main() {
    // Carve the lake to the terrain: anywhere the ground rises above the
    // water line there is simply no water, so the shoreline follows the relief.
    if (vWaterDepth <= 0.004) discard;

    vec2 pos = vLocalPosition.xy;
    float height = rippleHeight(pos);
    float dx = dFdx(height);
    float dy = dFdy(height);
    vec3 normal = normalize(vec3(-dx, -dy, 1.0));

    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);

    // Colour by the real water depth so deep parts of the valley read darker.
    float depthN = clamp(vWaterDepth / uDepthRange, 0.0, 1.0);
    depthN = smoothstep(0.0, 1.0, depthN);
    vec3 waterColor = mix(uBaseColor, uDeepColor, depthN);
    waterColor += fresnel * uFresnelStrength;

    // foam where the water meets the shore
    vec3 foamColor = vec3(1.0, 1.0, 1.0) * 0.95;
    float foamStrength = clamp(vShore, 0.0, 1.0);
    waterColor = mix(waterColor, foamColor, foamStrength * 0.7);

    // fade the very edge so the waterline blends into the terrain
    float edgeFade = smoothstep(0.004, 0.05, vWaterDepth);
    float alpha = uOpacity * (0.62 + fresnel * 0.38) * (0.5 + 0.5 * edgeFade);
    gl_FragColor = vec4(waterColor, alpha);
  }
`;

export const BED_VERTEX = `
  attribute float aDepth;
  varying vec2 vUv;
  varying vec3 vLocalPosition;
  varying float vDepth;
  varying float vWaterDepth;

  uniform float uDepth;
  uniform vec2 uBounds;

  void main() {
    vUv = uv;
    vWaterDepth = aDepth;
    vec3 displaced = position;
    vec2 scaled = displaced.xy / uBounds;
    float radial = clamp(length(scaled), 0.0, 1.0);
    float bowl = smoothstep(0.0, 1.0, 1.0 - radial);
    float depth = bowl * uDepth;
    displaced.z -= depth;
    vDepth = depth;
    vLocalPosition = displaced;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

export const BED_FRAGMENT = `
  uniform float uTime;
  uniform float uCausticsStrength;
  uniform vec2 uBounds;
  uniform vec3 uBedColor;
  uniform vec3 uCausticsColor;

  varying vec2 vUv;
  varying vec3 vLocalPosition;
  varying float vDepth;
  varying float vWaterDepth;

  float caustics(vec2 p) {
    float t = uTime * 0.8;
    float a = sin((p.x * 6.3 + t) + sin(p.y * 3.1 - t * 0.6));
    float b = sin((p.y * 7.1 - t * 0.7) + sin(p.x * 2.7 + t * 0.4));
    float c = sin((p.x + p.y) * 4.0 - t * 1.2);
    float pattern = (a + b + c) * 0.33;
    float caustic = smoothstep(0.35, 0.75, pattern);
    return caustic;
  }

  void main() {
    // Keep the lake floor only where there is water above it.
    if (vWaterDepth <= 0.004) discard;

    vec2 scaled = vLocalPosition.xy / uBounds;
    float depth = clamp(1.0 - length(scaled), 0.0, 1.0);
    float depthShade = clamp(vDepth / 0.35, 0.0, 1.0);
    vec3 baseColor = mix(uBedColor, uBedColor * 0.55, depth * 0.5 + depthShade * 0.5);

    float causticMask = caustics(scaled);
    vec3 causticColor = uCausticsColor * causticMask * uCausticsStrength;

    gl_FragColor = vec4(baseColor + causticColor, 1.0);
  }
`;
