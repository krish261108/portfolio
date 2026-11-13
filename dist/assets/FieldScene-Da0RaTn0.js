import{r as t,j as n}from"./index-j6bg2BQg.js";import{B as p,S as h,V as d,a as g,C as x,s as w,u as y,b as l,c as b,M as R}from"./r3f-CIA5UZpD.js";import{_ as S}from"./extends-CF3RwP-h.js";function M(){const e=new p,o=new Float32Array([-1,-1,3,-1,-1,3]);return e.boundingSphere=new h,e.boundingSphere.set(new d,1/0),e.setAttribute("position",new g(o,2)),e}const F=t.forwardRef(function({children:o,...s},r){const a=t.useMemo(M,[]);return t.createElement("mesh",S({ref:r,geometry:a,frustumCulled:!1},s),o)}),_=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`,C=`
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uVel;
  uniform vec2  uMouse;
  uniform vec2  uRes;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // gl_FragCoord is always correct; ScreenQuad's uv attribute is not
    // something to rely on, and a zeroed uv silently flattens the whole field.
    vec2 uv = gl_FragCoord.xy / uRes;
    vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 2.4;

    float t = uTime * 0.06;
    // Scroll speed shears the field, so fast scrolling visibly disturbs it.
    p.y += uVel * 0.55;

    vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p + 3.4 * q + vec2(1.7, 9.2) + 0.15 * t),
                  fbm(p + 3.4 * q + vec2(8.3, 2.8) + 0.13 * t));
    float f = fbm(p + 3.6 * r);
    // fbm clusters around 0.5; stretch it or the whole field reads as flat black.
    f = smoothstep(0.28, 0.72, f);

    vec3 base   = vec3(0.035, 0.032, 0.045);
    vec3 deep   = vec3(0.105, 0.165, 0.480);
    vec3 accent = vec3(0.800, 1.000, 0.000);

    vec3 col = mix(base, deep, f);
    col = mix(col, accent, pow(smoothstep(0.55, 0.95, f), 1.6) * 0.6);

    // Pointer bloom
    float d = length(p - uMouse * vec2(uRes.x / uRes.y, 1.0) * 1.2);
    col += vec3(0.24, 0.39, 1.0) * 0.2 * exp(-d * 2.0);
    // White-hot cores where the warp peaks.
    col = mix(col, vec3(1.0), pow(smoothstep(0.9, 1.0, f), 3.0) * 0.22);

    // Filament highlights along the warp ridges
    float ridge = smoothstep(0.46, 0.50, f) - smoothstep(0.54, 0.62, f);
    col += accent * ridge * 0.45;

    col *= 1.0 - 0.72 * length(uv - 0.5);
    gl_FragColor = vec4(col, 1.0);
  }
`;function V(){const e=t.useRef(),{size:o,pointer:s}=y(),r=t.useRef(0),a=t.useRef(0),f=t.useMemo(()=>({uTime:{value:0},uVel:{value:0},uMouse:{value:new l},uRes:{value:new l(1,1)}}),[]);return b((c,v)=>{const i=Math.min(v,.05),u=window.scrollY,m=(u-a.current)/Math.max(i,.001);a.current=u,r.current+=(R.clamp(m/3e3,-1.2,1.2)-r.current)*.08,e.current&&(e.current.uniforms.uTime.value+=i,e.current.uniforms.uVel.value=r.current,e.current.uniforms.uMouse.value.set(s.x,s.y),e.current.uniforms.uRes.value.set(c.size.width*c.viewport.dpr,c.size.height*c.viewport.dpr))}),n.jsx(F,{children:n.jsx("shaderMaterial",{ref:e,vertexShader:_,fragmentShader:C,uniforms:f,depthTest:!1,depthWrite:!1})})}function P(){return n.jsx(x,{className:"field__canvas",dpr:[1,1.5],gl:{antialias:!1,powerPreference:"high-performance"},...w(),children:n.jsx(V,{})})}export{P as default};
