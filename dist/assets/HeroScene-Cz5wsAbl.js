import{r as s,i as he,u as de,j as t}from"./index-j6bg2BQg.js";import{R as ve,i as pe,b as z,N as xe,U as T,W as J,H as oe,L as G,j as ge,k as _e,B as Me,a as Y,l as Se,m as ye,n as Te,u as Z,g as De,V as E,o as ee,p as te,P as we,q as Ue,r as Be,t as Re,c as K,C as Fe,s as je,v as be,f as re,e as Ee}from"./r3f-CIA5UZpD.js";import{w as Pe,V as Ce,E as ae,B as se}from"./Bloom-CbKmZaK6.js";import{N as Ae}from"./index-DuW8xdEp.js";import{E as ke,L as q}from"./Lightformer-BUCRuBm5.js";import{_ as Ie}from"./extends-CF3RwP-h.js";const ze=()=>parseInt(ve.replace(/\D+/g,"")),Ne=ze();class Ve extends pe{constructor(e=new z){super({uniforms:{inputBuffer:new T(null),depthBuffer:new T(null),resolution:new T(new z),texelSize:new T(new z),halfTexelSize:new T(new z),kernel:new T(0),scale:new T(1),cameraNear:new T(0),cameraFar:new T(1),minDepthThreshold:new T(0),maxDepthThreshold:new T(1),depthScale:new T(0),depthToBlurRatioBias:new T(.25)},fragmentShader:`#include <common>
        #include <dithering_pars_fragment>      
        uniform sampler2D inputBuffer;
        uniform sampler2D depthBuffer;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float minDepthThreshold;
        uniform float maxDepthThreshold;
        uniform float depthScale;
        uniform float depthToBlurRatioBias;
        varying vec2 vUv;
        varying vec2 vUv0;
        varying vec2 vUv1;
        varying vec2 vUv2;
        varying vec2 vUv3;

        void main() {
          float depthFactor = 0.0;
          
          #ifdef USE_DEPTH
            vec4 depth = texture2D(depthBuffer, vUv);
            depthFactor = smoothstep(minDepthThreshold, maxDepthThreshold, 1.0-(depth.r * depth.a));
            depthFactor *= depthScale;
            depthFactor = max(0.0, min(1.0, depthFactor + 0.25));
          #endif
          
          vec4 sum = texture2D(inputBuffer, mix(vUv0, vUv, depthFactor));
          sum += texture2D(inputBuffer, mix(vUv1, vUv, depthFactor));
          sum += texture2D(inputBuffer, mix(vUv2, vUv, depthFactor));
          sum += texture2D(inputBuffer, mix(vUv3, vUv, depthFactor));
          gl_FragColor = sum * 0.25 ;

          #include <dithering_fragment>
          #include <tonemapping_fragment>
          #include <${Ne>=154?"colorspace_fragment":"encodings_fragment"}>
        }`,vertexShader:`uniform vec2 texelSize;
        uniform vec2 halfTexelSize;
        uniform float kernel;
        uniform float scale;
        varying vec2 vUv;
        varying vec2 vUv0;
        varying vec2 vUv1;
        varying vec2 vUv2;
        varying vec2 vUv3;

        void main() {
          vec2 uv = position.xy * 0.5 + 0.5;
          vUv = uv;

          vec2 dUv = (texelSize * vec2(kernel) + halfTexelSize) * scale;
          vUv0 = vec2(uv.x - dUv.x, uv.y + dUv.y);
          vUv1 = vec2(uv.x + dUv.x, uv.y + dUv.y);
          vUv2 = vec2(uv.x + dUv.x, uv.y - dUv.y);
          vUv3 = vec2(uv.x - dUv.x, uv.y - dUv.y);

          gl_Position = vec4(position.xy, 1.0, 1.0);
        }`,blending:xe,depthWrite:!1,depthTest:!1}),this.toneMapped=!1,this.setTexelSize(e.x,e.y),this.kernel=new Float32Array([0,1,2,2,3])}setTexelSize(e,r){this.uniforms.texelSize.value.set(e,r),this.uniforms.halfTexelSize.value.set(e,r).multiplyScalar(.5)}setResolution(e){this.uniforms.resolution.value.copy(e)}}class Le{constructor({gl:e,resolution:r,width:o=500,height:a=500,minDepthThreshold:v=0,maxDepthThreshold:f=1,depthScale:m=0,depthToBlurRatioBias:_=.25}){this.renderToScreen=!1,this.renderTargetA=new J(r,r,{minFilter:G,magFilter:G,stencilBuffer:!1,depthBuffer:!1,type:oe}),this.renderTargetB=this.renderTargetA.clone(),this.convolutionMaterial=new Ve,this.convolutionMaterial.setTexelSize(1/o,1/a),this.convolutionMaterial.setResolution(new z(o,a)),this.scene=new ge,this.camera=new _e,this.convolutionMaterial.uniforms.minDepthThreshold.value=v,this.convolutionMaterial.uniforms.maxDepthThreshold.value=f,this.convolutionMaterial.uniforms.depthScale.value=m,this.convolutionMaterial.uniforms.depthToBlurRatioBias.value=_,this.convolutionMaterial.defines.USE_DEPTH=m>0;const h=new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),S=new Float32Array([0,0,2,0,0,2]),i=new Me;i.setAttribute("position",new Y(h,3)),i.setAttribute("uv",new Y(S,2)),this.screen=new Se(i,this.convolutionMaterial),this.screen.frustumCulled=!1,this.scene.add(this.screen)}render(e,r,o){const a=this.scene,v=this.camera,f=this.renderTargetA,m=this.renderTargetB;let _=this.convolutionMaterial,h=_.uniforms;h.depthBuffer.value=r.depthTexture;const S=_.kernel;let i=r,u,c,D;for(c=0,D=S.length-1;c<D;++c)u=c&1?m:f,h.kernel.value=S[c],h.inputBuffer.value=i.texture,e.setRenderTarget(u),e.render(a,v),i=u;h.kernel.value=S[c],h.inputBuffer.value=i.texture,e.setRenderTarget(this.renderToScreen?null:o),e.render(a,v)}}let We=class extends ye{constructor(e={}){super(e),this._tDepth={value:null},this._distortionMap={value:null},this._tDiffuse={value:null},this._tDiffuseBlur={value:null},this._textureMatrix={value:null},this._hasBlur={value:!1},this._mirror={value:0},this._mixBlur={value:0},this._blurStrength={value:.5},this._minDepthThreshold={value:.9},this._maxDepthThreshold={value:1},this._depthScale={value:0},this._depthToBlurRatioBias={value:.25},this._distortion={value:1},this._mixContrast={value:1},this.setValues(e)}onBeforeCompile(e){var r;(r=e.defines)!=null&&r.USE_UV||(e.defines.USE_UV=""),e.uniforms.hasBlur=this._hasBlur,e.uniforms.tDiffuse=this._tDiffuse,e.uniforms.tDepth=this._tDepth,e.uniforms.distortionMap=this._distortionMap,e.uniforms.tDiffuseBlur=this._tDiffuseBlur,e.uniforms.textureMatrix=this._textureMatrix,e.uniforms.mirror=this._mirror,e.uniforms.mixBlur=this._mixBlur,e.uniforms.mixStrength=this._blurStrength,e.uniforms.minDepthThreshold=this._minDepthThreshold,e.uniforms.maxDepthThreshold=this._maxDepthThreshold,e.uniforms.depthScale=this._depthScale,e.uniforms.depthToBlurRatioBias=this._depthToBlurRatioBias,e.uniforms.distortion=this._distortion,e.uniforms.mixContrast=this._mixContrast,e.vertexShader=`
        uniform mat4 textureMatrix;
        varying vec4 my_vUv;
      ${e.vertexShader}`,e.vertexShader=e.vertexShader.replace("#include <project_vertex>",`#include <project_vertex>
        my_vUv = textureMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );`),e.fragmentShader=`
        uniform sampler2D tDiffuse;
        uniform sampler2D tDiffuseBlur;
        uniform sampler2D tDepth;
        uniform sampler2D distortionMap;
        uniform float distortion;
        uniform float cameraNear;
			  uniform float cameraFar;
        uniform bool hasBlur;
        uniform float mixBlur;
        uniform float mirror;
        uniform float mixStrength;
        uniform float minDepthThreshold;
        uniform float maxDepthThreshold;
        uniform float mixContrast;
        uniform float depthScale;
        uniform float depthToBlurRatioBias;
        varying vec4 my_vUv;
        ${e.fragmentShader}`,e.fragmentShader=e.fragmentShader.replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>

      float distortionFactor = 0.0;
      #ifdef USE_DISTORTION
        distortionFactor = texture2D(distortionMap, vUv).r * distortion;
      #endif

      vec4 new_vUv = my_vUv;
      new_vUv.x += distortionFactor;
      new_vUv.y += distortionFactor;

      vec4 base = texture2DProj(tDiffuse, new_vUv);
      vec4 blur = texture2DProj(tDiffuseBlur, new_vUv);

      vec4 merge = base;

      #ifdef USE_NORMALMAP
        vec2 normal_uv = vec2(0.0);
        vec4 normalColor = texture2D(normalMap, vUv * normalScale);
        vec3 my_normal = normalize( vec3( normalColor.r * 2.0 - 1.0, normalColor.b,  normalColor.g * 2.0 - 1.0 ) );
        vec3 coord = new_vUv.xyz / new_vUv.w;
        normal_uv = coord.xy + coord.z * my_normal.xz * 0.05;
        vec4 base_normal = texture2D(tDiffuse, normal_uv);
        vec4 blur_normal = texture2D(tDiffuseBlur, normal_uv);
        merge = base_normal;
        blur = blur_normal;
      #endif

      float depthFactor = 0.0001;
      float blurFactor = 0.0;

      #ifdef USE_DEPTH
        vec4 depth = texture2DProj(tDepth, new_vUv);
        depthFactor = smoothstep(minDepthThreshold, maxDepthThreshold, 1.0-(depth.r * depth.a));
        depthFactor *= depthScale;
        depthFactor = max(0.0001, min(1.0, depthFactor));

        #ifdef USE_BLUR
          blur = blur * min(1.0, depthFactor + depthToBlurRatioBias);
          merge = merge * min(1.0, depthFactor + 0.5);
        #else
          merge = merge * depthFactor;
        #endif

      #endif

      float reflectorRoughnessFactor = roughness;
      #ifdef USE_ROUGHNESSMAP
        vec4 reflectorTexelRoughness = texture2D( roughnessMap, vUv );
        reflectorRoughnessFactor *= reflectorTexelRoughness.g;
      #endif

      #ifdef USE_BLUR
        blurFactor = min(1.0, mixBlur * reflectorRoughnessFactor);
        merge = mix(merge, blur, blurFactor);
      #endif

      vec4 newMerge = vec4(0.0, 0.0, 0.0, 1.0);
      newMerge.r = (merge.r - 0.5) * mixContrast + 0.5;
      newMerge.g = (merge.g - 0.5) * mixContrast + 0.5;
      newMerge.b = (merge.b - 0.5) * mixContrast + 0.5;

      diffuseColor.rgb = diffuseColor.rgb * ((1.0 - min(1.0, mirror)) + newMerge.rgb * mixStrength);
      `)}get tDiffuse(){return this._tDiffuse.value}set tDiffuse(e){this._tDiffuse.value=e}get tDepth(){return this._tDepth.value}set tDepth(e){this._tDepth.value=e}get distortionMap(){return this._distortionMap.value}set distortionMap(e){this._distortionMap.value=e}get tDiffuseBlur(){return this._tDiffuseBlur.value}set tDiffuseBlur(e){this._tDiffuseBlur.value=e}get textureMatrix(){return this._textureMatrix.value}set textureMatrix(e){this._textureMatrix.value=e}get hasBlur(){return this._hasBlur.value}set hasBlur(e){this._hasBlur.value=e}get mirror(){return this._mirror.value}set mirror(e){this._mirror.value=e}get mixBlur(){return this._mixBlur.value}set mixBlur(e){this._mixBlur.value=e}get mixStrength(){return this._blurStrength.value}set mixStrength(e){this._blurStrength.value=e}get minDepthThreshold(){return this._minDepthThreshold.value}set minDepthThreshold(e){this._minDepthThreshold.value=e}get maxDepthThreshold(){return this._maxDepthThreshold.value}set maxDepthThreshold(e){this._maxDepthThreshold.value=e}get depthScale(){return this._depthScale.value}set depthScale(e){this._depthScale.value=e}get depthToBlurRatioBias(){return this._depthToBlurRatioBias.value}set depthToBlurRatioBias(e){this._depthToBlurRatioBias.value=e}get distortion(){return this._distortion.value}set distortion(e){this._distortion.value=e}get mixContrast(){return this._mixContrast.value}set mixContrast(e){this._mixContrast.value=e}};const He=s.forwardRef(({mixBlur:n=0,mixStrength:e=1,resolution:r=256,blur:o=[0,0],minDepthThreshold:a=.9,maxDepthThreshold:v=1,depthScale:f=0,depthToBlurRatioBias:m=.25,mirror:_=0,distortion:h=1,mixContrast:S=1,distortionMap:i,reflectorOffset:u=0,...c},D)=>{Te({MeshReflectorMaterialImpl:We});const l=Z(({gl:M})=>M),U=Z(({camera:M})=>M),d=Z(({scene:M})=>M);o=Array.isArray(o)?o:[o,o];const F=o[0]+o[1]>0,p=s.useRef(null);s.useImperativeHandle(D,()=>p.current,[]);const[B]=s.useState(()=>new De),[w]=s.useState(()=>new E),[b]=s.useState(()=>new E),[O]=s.useState(()=>new E),[A]=s.useState(()=>new ee),[L]=s.useState(()=>new E(0,0,-1)),[R]=s.useState(()=>new te),[k]=s.useState(()=>new E),[W]=s.useState(()=>new E),[I]=s.useState(()=>new te),[P]=s.useState(()=>new ee),[y]=s.useState(()=>new we),ue=s.useCallback(()=>{var M;const x=p.current.parent||((M=p.current)==null?void 0:M.__r3f.parent);if(!x||(b.setFromMatrixPosition(x.matrixWorld),O.setFromMatrixPosition(U.matrixWorld),A.extractRotation(x.matrixWorld),w.set(0,0,1),w.applyMatrix4(A),b.addScaledVector(w,u),k.subVectors(b,O),k.dot(w)>0))return;k.reflect(w).negate(),k.add(b),A.extractRotation(U.matrixWorld),L.set(0,0,-1),L.applyMatrix4(A),L.add(O),W.subVectors(b,L),W.reflect(w).negate(),W.add(b),y.position.copy(k),y.up.set(0,1,0),y.up.applyMatrix4(A),y.up.reflect(w),y.lookAt(W),y.far=U.far,y.updateMatrixWorld(),y.projectionMatrix.copy(U.projectionMatrix),P.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),P.multiply(y.projectionMatrix),P.multiply(y.matrixWorldInverse),P.multiply(x.matrixWorld),B.setFromNormalAndCoplanarPoint(w,b),B.applyMatrix4(y.matrixWorldInverse),R.set(B.normal.x,B.normal.y,B.normal.z,B.constant);const g=y.projectionMatrix;I.x=(Math.sign(R.x)+g.elements[8])/g.elements[0],I.y=(Math.sign(R.y)+g.elements[9])/g.elements[5],I.z=-1,I.w=(1+g.elements[10])/g.elements[14],R.multiplyScalar(2/R.dot(I)),g.elements[2]=R.x,g.elements[6]=R.y,g.elements[10]=R.z+1,g.elements[14]=R.w},[U,u]),[Q,ce,fe,H]=s.useMemo(()=>{const M={minFilter:G,magFilter:G,type:oe},x=new J(r,r,M);x.depthBuffer=!0,x.depthTexture=new Ue(r,r),x.depthTexture.format=Be,x.depthTexture.type=Re;const g=new J(r,r,M),$=new Le({gl:l,resolution:r,width:o[0],height:o[1],minDepthThreshold:a,maxDepthThreshold:v,depthScale:f,depthToBlurRatioBias:m}),me={mirror:_,textureMatrix:P,mixBlur:n,tDiffuse:x.texture,tDepth:x.depthTexture,tDiffuseBlur:g.texture,hasBlur:F,mixStrength:e,minDepthThreshold:a,maxDepthThreshold:v,depthScale:f,depthToBlurRatioBias:m,distortion:h,distortionMap:i,mixContrast:S,"defines-USE_BLUR":F?"":void 0,"defines-USE_DEPTH":f>0?"":void 0,"defines-USE_DISTORTION":i?"":void 0};return[x,g,$,me]},[l,o,P,r,_,F,n,e,a,v,f,m,h,i,S]);return K(()=>{var M;const x=p.current.parent||((M=p.current)==null?void 0:M.__r3f.parent);if(!x)return;x.visible=!1;const g=l.xr.enabled,$=l.shadowMap.autoUpdate;ue(),l.xr.enabled=!1,l.shadowMap.autoUpdate=!1,l.setRenderTarget(Q),l.state.buffers.depth.setMask(!0),l.autoClear||l.clear(),l.render(d,y),F&&fe.render(l,Q,ce),l.xr.enabled=g,l.shadowMap.autoUpdate=$,x.visible=!0,l.setRenderTarget(null)}),s.createElement("meshReflectorMaterialImpl",Ie({attach:"material",key:"key"+H["defines-USE_BLUR"]+H["defines-USE_DEPTH"]+H["defines-USE_DISTORTION"],ref:p},H,c))}),ne=Pe(Ce),N=12,V=-118,C=N-V,Ge=5.4,le=4.4,ie=4.2,Oe=48,j=n=>{const e=Math.sin(n*127.1+311.7)*43758.5453;return e-Math.floor(e)},X=n=>V+((n-V)%C+C)%C;function $e(n){const e=[];for(const r of[-1,1])for(let o=0;o<n;o++){const a=o*2+(r>0?1:0),v=2.6+j(a+1)*2.6,f=2.6+j(a+2)*2.4,m=5+Math.pow(j(a+3),1.5)*24;e.push({side:r,w:v,d:f,h:m,x:r*(le+.8+v/2+j(a+4)*1.6),z:N-o*Ge-j(a+5)*1.8,seed:a})}return e}function Ze(){const n=new Ee({color:"#151a24",roughness:.26,metalness:.25,clearcoat:1,clearcoatRoughness:.16});return n.userData.uTime={value:0},n.onBeforeCompile=e=>{e.uniforms.uTime=n.userData.uTime,e.vertexShader=e.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vFacade;
varying float vUp;
varying float vSeed;`).replace("#include <begin_vertex>",`#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vSeed = float(gl_InstanceID);
        #else
          vec3 sc = vec3(1.0);
          vSeed = 0.0;
        #endif
        vFacade = position * sc;
        vUp = abs(normal.y);`),e.fragmentShader=e.fragmentShader.replace("#include <common>",`#include <common>
varying vec3 vFacade;
varying float vUp;
varying float vSeed;
uniform float uTime;`).replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>
        {
          vec2 cell = vec2((vFacade.x + vFacade.z) * 2.9, vFacade.y * 2.5);
          vec2 g = fract(cell);
          float win = step(0.24, g.x) * step(g.x, 0.76) * step(0.3, g.y) * step(g.y, 0.7);
          vec2 id = floor(cell) + vSeed * 17.0;
          float r = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
          float lit = step(0.74, r) * (0.78 + 0.22 * sin(uTime * (0.5 + r * 1.8) + r * 40.0));
          vec3 tint = r > 0.965 ? vec3(0.8, 1.0, 0.0) : (r > 0.875 ? vec3(0.95, 0.96, 1.0) : vec3(0.24, 0.39, 1.0));
          float side = 1.0 - step(0.5, vUp);
          totalEmissiveRadiance += tint * win * lit * side * 1.5;
        }`)},n}function qe({perSide:n,reduced:e,lowPower:r}){const o=s.useMemo(()=>$e(n),[n]),a=s.useMemo(()=>{const u=[];return o.forEach((c,D)=>{if(j(c.seed+9)>.35){const l=c.h*(.45+j(c.seed+10)*.5);u.push({b:c,kind:"v",h:l,lime:D%3===0})}j(c.seed+11)>.55&&u.push({b:c,kind:"roof",lime:D%2===0})}),u},[o]),v=36,f=s.useRef(),m=s.useRef(),_=s.useRef(),h=s.useMemo(()=>Ze(),[]),S=s.useRef(0),i=s.useMemo(()=>new be,[]);return s.useEffect(()=>()=>h.dispose(),[h]),s.useEffect(()=>{const u=m.current;if(!u)return;const c=new re("#ccff00").multiplyScalar(2.2),D=new re("#4f74ff").multiplyScalar(2.6);a.forEach((l,U)=>u.setColorAt(U,l.lime?c:D)),u.instanceColor&&(u.instanceColor.needsUpdate=!0)},[a]),K((u,c)=>{const D=Math.min(c,.03333333333333333),l=u.clock.elapsedTime;h.userData.uTime.value=l;const U=e?0:ie+(Oe-ie)*Math.exp(-l*1.25);if(S.current+=U*D,f.current&&(o.forEach((d,F)=>{i.position.set(d.x,d.h/2,X(d.z+S.current)),i.rotation.set(0,0,0),i.scale.set(d.w,d.h,d.d),i.updateMatrix(),f.current.setMatrixAt(F,i.matrix)}),f.current.instanceMatrix.needsUpdate=!0),m.current&&(a.forEach((d,F)=>{const p=d.b,B=X(p.z+S.current),w=p.x-p.side*(p.w/2);d.kind==="v"?(i.position.set(w-p.side*.03,d.h/2,B+p.d/2),i.scale.set(.07,d.h,.07)):(i.position.set(w-p.side*.03,p.h,B),i.scale.set(.07,.07,p.d)),i.rotation.set(0,0,0),i.updateMatrix(),m.current.setMatrixAt(F,i.matrix)}),m.current.instanceMatrix.needsUpdate=!0),_.current){for(let d=0;d<v;d++)i.position.set(0,.012,X(N-d*(C/v)+S.current)),i.rotation.set(-Math.PI/2,0,0),i.scale.set(.09,1.3,1),i.updateMatrix(),_.current.setMatrixAt(d,i.matrix);_.current.instanceMatrix.needsUpdate=!0}}),t.jsxs(t.Fragment,{children:[t.jsx("instancedMesh",{ref:f,args:[void 0,void 0,o.length],material:h,frustumCulled:!1,children:t.jsx("boxGeometry",{args:[1,1,1]})}),t.jsxs("instancedMesh",{ref:m,args:[void 0,void 0,a.length],frustumCulled:!1,children:[t.jsx("boxGeometry",{args:[1,1,1]}),t.jsx("meshBasicMaterial",{toneMapped:!1})]}),t.jsxs("instancedMesh",{ref:_,args:[void 0,void 0,v],frustumCulled:!1,children:[t.jsx("planeGeometry",{args:[1,1]}),t.jsx("meshBasicMaterial",{color:[1.05,1.1,.85],toneMapped:!1})]}),[-1,1].map(u=>t.jsxs("mesh",{position:[u*le,.015,(N+V)/2],rotation:[-Math.PI/2,0,0],children:[t.jsx("planeGeometry",{args:[.06,C]}),t.jsx("meshBasicMaterial",{color:[.45,.6,2.4],toneMapped:!1})]},u)),t.jsxs("mesh",{rotation:[-Math.PI/2,0,0],position:[0,0,(N+V)/2],children:[t.jsx("planeGeometry",{args:[80,C]}),r?t.jsx("meshStandardMaterial",{color:"#07080b",roughness:.32,metalness:.7}):t.jsx(He,{blur:[260,70],resolution:512,mixBlur:.9,mixStrength:38,roughness:.82,depthScale:1.1,minDepthThreshold:.4,maxDepthThreshold:1.4,color:"#06070a",metalness:.6,mirror:.85})]})]})}function Xe({reduced:n}){const e=s.useMemo(()=>new E,[]);return K((r,o)=>{const a=r.camera,v=r.clock.elapsedTime,f=1-Math.exp(-2.6*Math.min(o,1/30)),m=-1.3+(n?0:r.pointer.x*.9),_=1.7+(n?0:r.pointer.y*.45);a.position.x+=(m-a.position.x)*f,a.position.y+=(_-a.position.y)*f;const h=n?52:52+24*Math.exp(-v*1.4);Math.abs(a.fov-h)>.01&&(a.fov=h,a.updateProjectionMatrix()),e.set(1.4+(n?0:r.pointer.x*.6),3.4,-40),a.lookAt(e)}),null}function at(){const n=s.useMemo(()=>he(),[]),e=de();return t.jsxs(Fe,{className:"hero__canvas",dpr:[1,n?1.3:1.6],gl:{antialias:!1,powerPreference:"high-performance"},camera:{position:[-1.3,1.7,8],fov:76,near:.1,far:200},...je(),children:[t.jsx("color",{attach:"background",args:["#07070b"]}),t.jsx("fogExp2",{attach:"fog",args:["#07070b",.026]}),t.jsx("ambientLight",{intensity:.18}),t.jsx("directionalLight",{position:[-6,18,6],intensity:.7,color:"#b9c6ff"}),t.jsx("pointLight",{position:[3.5,2.5,-4],intensity:60,distance:26,color:"#ccff00"}),t.jsx("pointLight",{position:[-3.5,4,-14],intensity:90,distance:34,color:"#3d63ff"}),t.jsxs(ke,{resolution:256,frames:1,children:[t.jsx(q,{form:"rect",intensity:2.4,position:[0,12,-10],"rotation-x":Math.PI/2,scale:[4,60,1]}),t.jsx(q,{form:"rect",color:"#3d63ff",intensity:5,position:[-14,6,-20],"rotation-y":Math.PI/2,scale:[40,3,1]}),t.jsx(q,{form:"rect",color:"#ccff00",intensity:3,position:[14,4,-30],"rotation-y":-Math.PI/2,scale:[40,2,1]})]}),t.jsx(qe,{perSide:n?15:22,reduced:e,lowPower:n}),t.jsx(Xe,{reduced:e}),n?t.jsxs(ae,{disableNormalPass:!0,children:[t.jsx(se,{intensity:1,luminanceThreshold:.4,luminanceSmoothing:.3,mipmapBlur:!0}),t.jsx(ne,{offset:.25,darkness:.75})]}):t.jsxs(ae,{disableNormalPass:!0,multisampling:4,children:[t.jsx(Ae,{aoRadius:1.6,distanceFalloff:1,intensity:2.5,halfRes:!0}),t.jsx(se,{intensity:1.1,luminanceThreshold:.38,luminanceSmoothing:.3,mipmapBlur:!0}),t.jsx(ne,{offset:.25,darkness:.75})]})]})}export{at as default};
