(function () {
  'use strict';

  const interpolatePoints = (points, numberOfPoints) => {
    if (numberOfPoints <= 0) {
      return [];
    }

    const totalPoints = points.length;
    const step = (totalPoints - 1) / (numberOfPoints - 1);
    const interpolatedPoints = [];

    for (let i = 0; i < numberOfPoints; i++) {
      const index = i * step;
      const floorIndex = Math.floor(index);
      const ceilIndex = Math.ceil(index);

      if (floorIndex === ceilIndex) {
        interpolatedPoints.push(points[floorIndex]);
      } else {
        const fraction = index - floorIndex;
        const floorPoint = points[floorIndex];
        const ceilPoint = points[ceilIndex];

        const x = floorPoint[0] + (ceilPoint[0] - floorPoint[0]) * fraction;
        const y = floorPoint[1] + (ceilPoint[1] - floorPoint[1]) * fraction;
        interpolatedPoints.push([x, y]);
      }
    }

    return interpolatedPoints;
  };

  const subdivideVertices = (subdivisions) => {
    const triangles = [];

    const step = 2 / subdivisions;
    for (let i = 0; i < subdivisions; i++) {
      for (let j = 0; j < subdivisions; j++) {
        const x = -1 + j * step;
        const y = -1 + i * step;
        const triangle1 = [x, y, x + step, y, x, y + step];
        const triangle2 = [x + step, y, x, y + step, x + step, y + step];
        triangles.push(triangle1, triangle2);
      }
    }

    return triangles.flat();
  };

  // Helper functions
  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      // console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      // console.error('Program linking error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    return program;
  }

  const addBlurPass = (gl, canvas) => {
    // Create vertex shader for post-processing effect
    const postProcessVertexShaderSource = `
        attribute vec2 position;
        varying vec2 texCoords;

        void main() {
            texCoords = (position + 1.0) * 0.5;
            gl_Position = vec4(position, 0.0, 1.0);
        }
        `;

    // Create fragment shader for post-processing effect
    const postProcessFragmentShaderSource = `
        precision mediump float;
        varying vec2 texCoords;
        uniform sampler2D uTextureASCII;
        uniform vec2 uResolution;
        uniform vec3 uChaos;
        uniform float uAberrationChaos;
        uniform float uAberrationBase;
        uniform float uLensDistortion;

        void main() {
            vec2 uv = texCoords;
            uv.x *=  abs(uv.x - 1.0) * 2.0; 
            float dist =  max((1.0 - (distance(vec2(0.5), uv) * 1.0)),0.0);
            float scale = uAberrationChaos * 0.1 * dist;

            vec2 lensDistortion = texCoords;
            
            vec2 offset = lensDistortion - vec2(0.5);
            float dist2 = distance(lensDistortion, vec2(0.5));
            lensDistortion = lensDistortion + offset * (uLensDistortion * -1.0 * dist2 * dist2 * dist2);
            
            float scaleX = (uAberrationBase * 0.01 * dist) + (uChaos.y * scale * dist);
            float scaleY = (uAberrationBase * 0.01 * dist) + (uChaos.z * scale * dist);            

            vec4 frameR = texture2D(uTextureASCII, vec2(lensDistortion.x + scaleX * 1.1, lensDistortion.y + scaleY * 1.9));
            vec4 frameG = texture2D(uTextureASCII, vec2(lensDistortion.x + scaleX * 1.5, lensDistortion.y + scaleY * 1.3));
            vec4 frameB = texture2D(uTextureASCII, vec2(lensDistortion.x + scaleX * 1.2, lensDistortion.y + scaleY * 1.5));

            vec3 color = vec3(frameR.r, frameG.g, frameB.b);

            // color *= dist * 2.0;
            color += uChaos.x * 0.5;

            gl_FragColor = vec4(color, 1.0);
        }
    `;

    const postProcessVertexShader = createShader(gl, gl.VERTEX_SHADER, postProcessVertexShaderSource);
    const postProcessFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, postProcessFragmentShaderSource);
    const postProcessProgram = createProgram(gl, postProcessVertexShader, postProcessFragmentShader);

    gl.useProgram(postProcessProgram);

    const uChaos = gl.getUniformLocation(postProcessProgram, 'uChaos');

    const textureUniformLocation = gl.getUniformLocation(postProcessProgram, 'uTextureASCII');
    gl.uniform1i(textureUniformLocation, 0);

    // Create the framebuffer
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    // Resolution
    const uResolution = gl.getUniformLocation(postProcessProgram, 'uResolution');
    gl.uniform2f(uResolution, Math.max(canvas.width / canvas.height, 1), Math.max(canvas.height / canvas.width, 1));

    return {
      buffer: framebuffer,
      texture: texture,
      program: postProcessProgram,
      resolution: uResolution,
      uniforms: {
        chaos: uChaos
      }
    };
  };

  const glslNoise = `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float noise(vec3 v){ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

// Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //  x0 = x0 - 0. + 0.0 * C 
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1. + 3.0 * C.xxx;

// Permutations
  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

// Gradients
// ( N*N points uniformly over a square, mapped onto an octahedron.)
  float n_ = 1.0/7.0; // N=7
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

//Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

// Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}
`;

  const addShader = (gl, vertices, numberOfPoints, canvas, face) => {
    // Create vertex shader for full-screen quad
    const vertexShaderSource = `
        attribute vec2 position;
        varying vec2 texCoords;
        varying float vBrightness;
        attribute float aBrightness;
        attribute vec2 aFlow;  
        varying vec2 vFlow; 

        void main() {
            vFlow = aFlow;
            vBrightness = aBrightness;
            texCoords = (position + 1.0) * 0.5;
            gl_Position = vec4(position, 0.0, 1.0);
        }
    `;

    // Create fragment shader for full-screen quad
    const fragmentShaderSource = `
        precision mediump float;
        varying vec2 texCoords;
        uniform float uTime;
        varying vec2 vPosition;
        varying float vBrightness;
        varying vec2 vFlow;
        uniform vec2 uResolutionDraw;
        uniform vec2 uFlow;
        uniform sampler2D uFace;
        uniform float uChaos;
        uniform vec2 uNoiseScale;
        uniform float uNoiseSpeed;
        uniform float uNoiseContrast;
        uniform float uLogoFalloff;
        uniform float uNoiseBrightness;
        uniform float uSpin;

        ${glslNoise}

        vec2 rotate(vec2 v, float theta) {
          float c = cos(theta);
          float s = sin(theta);
          
          mat2 rotationMatrix = mat2(c, -s, s, c);
          
          vec2 rotationPoint = vec2(0.5);  // Constant rotation point
          
          return rotationMatrix * (v - rotationPoint) + rotationPoint;
        }
  
        void main() {
            vec2 uv = texCoords;
            uv.y = 1.0 - uv.y;
            uv.x *= uResolutionDraw.x;
            uv.y *= uResolutionDraw.y;

            float chaos = uChaos;
            vec2 faceUV = uv; 

            faceUV.y += 0.5 * (1.0 - uResolutionDraw.y);
            faceUV.x += 0.5 * (1.0 - uResolutionDraw.x);
            
            float faceScale = max((1.0 / uResolutionDraw.x) * 1.2, 0.5);

            faceUV *= faceScale;
            faceUV += (1.0 - faceScale) / 2.0;
            
            vec4 face = texture2D(uFace, faceUV);
      
            face.rgb = clamp((face.rgb - 0.5) * uLogoFalloff + 0.5, 0.0, 1.0);
            
            vec2 finalFlow = uv + uFlow + vFlow;
            
            uv = finalFlow;

            uv = rotate(uv, uSpin);

            float brightness = 0.0;

            vec2 scaledUV = uv * uNoiseScale.x;
            float scaledTime = uTime * 0.0005 * uNoiseSpeed;

            float noiseBG = noise(vec3(scaledUV, scaledTime)) * 0.75;
            noiseBG += noise(vec3(uv * uNoiseScale.y, scaledTime)) * 0.25;

            noiseBG = abs(noiseBG * 2.0 - 1.0);

            noiseBG = max((noiseBG - 0.5) * uNoiseContrast + 0.5, 0.0);
            noiseBG += uNoiseBrightness * 0.5;

            brightness += noiseBG;
            brightness *= face.r;


            float brightnessContrast = max((vBrightness - 0.5) * 2.5 + 0.5, 0.0);
            brightness += brightnessContrast * 5.0;

            gl_FragColor = vec4(vec3(brightness), 1.0);
            // gl_FragColor = vec4(vec3(noiseBG), 1.0);
        }
    `;

    // Create the shader programs
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = createProgram(gl, vertexShader, fragmentShader);

    gl.useProgram(program);

    // Create the buffer for full-screen quad
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    // Set up attribute and uniform locations for full-screen shader
    const fullScreenPositionAttributeLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(fullScreenPositionAttributeLocation);
    gl.vertexAttribPointer(fullScreenPositionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    // Resolution
    const uResolution = gl.getUniformLocation(program, 'uResolutionDraw');
    gl.uniform2f(uResolution, Math.max(canvas.width / canvas.height, 1), Math.max(canvas.height / canvas.width, 1));

    // Uniforms //
    const uFlow = gl.getUniformLocation(program, 'uFlow');
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uChaos = gl.getUniformLocation(program, 'uChaos');
    const uSpin = gl.getUniformLocation(program, 'uSpin');

    // Brightness
    const brightnessData = new Float32Array(vertices.length / 2);
    brightnessData.fill(0.0);

    const brightnessBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, brightnessBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, brightnessData, gl.STATIC_DRAW);

    const aBrightness = gl.getAttribLocation(program, 'aBrightness');
    gl.enableVertexAttribArray(aBrightness);
    gl.bindBuffer(gl.ARRAY_BUFFER, brightnessBuffer);
    gl.vertexAttribPointer(aBrightness, 1, gl.FLOAT, false, 0, 0);

    // Flow
    const flowData = new Float32Array(vertices.length);
    flowData.fill(0.0);

    const flowBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, flowBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flowData, gl.STATIC_DRAW);

    const aFlow = gl.getAttribLocation(program, 'aFlow');
    gl.enableVertexAttribArray(aFlow);
    gl.bindBuffer(gl.ARRAY_BUFFER, flowBuffer);
    gl.vertexAttribPointer(aFlow, 2, gl.FLOAT, false, 0, 0);


    // 20S Video Texture
    const videoTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, face);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    gl.uniform1i(gl.getUniformLocation(program, 'uFace'), 3);


    return {
      program: program,
      uniforms: {
        resolution: uResolution,
        time: uTime,
        chaos: uChaos,
        brightness: {
          buffer: brightnessBuffer,
          data: brightnessData,
          attribute: aBrightness,
        },
        uFlow: {
          location: uFlow,
          velocity: {x: 0, y: 0},
          data: {x: 0, y: 0}
        },
        flow: {
          buffer: flowBuffer,
          data: flowData,
          velocityData: Array(vertices.length).fill(0),
          attribute: aFlow,
        },
        face: {
          texture: videoTexture
        },
        spin: {
          location: uSpin,
          data: 0,
        },
      },
    };
  };

  const addASCIIPass = (gl, canvas, img) => {
    // Create vertex shader for post-processing effect
    const postProcessVertexShaderSource = `
        attribute vec2 position;
        varying vec2 texCoords;
    
        void main() {
            texCoords = (position + 1.0) * 0.5;
            gl_Position = vec4(position, 0.0, 1.0);
        }
        `;

    // Create fragment shader for post-processing effect
    const postProcessFragmentShaderSource = `
        precision mediump float;
        varying vec2 texCoords;
        // uniform sampler2D uTextureBlur;
        uniform sampler2D uTextureDraw;
        uniform sampler2D uSprite;
        uniform vec2 uResolution;
        uniform float uTime;
        uniform float uAsciiScale;
        uniform vec3 uHighlightColour;
        uniform vec3 uBackgroundColour;
        uniform float uHighlightFalloff;

        void main() {
          float chars = 15.0;
          float density = uAsciiScale;

          vec2 pixelation = vec2(1.0 / density * 2.0);
          pixelation *= 1.0 / uResolution * 0.5;
          
          vec2 stPixelated = floor(texCoords / pixelation) * pixelation;
          vec4 color = texture2D(uTextureDraw, stPixelated);
          vec4 baseColor = texture2D(uTextureDraw, texCoords);

          float asciiIndex = (floor((1.0 - color.x) * (chars - 1.0)) - 1.0) * (1.0 / chars);

          vec2 spriteCoord = vec2(mod(texCoords.x * uResolution.x * density, 1.0) * (1.0 / chars) + (asciiIndex + (1.0 / chars)), mod((1.0 - texCoords.y * uResolution.y) * density, 1.0));

          vec4 asciiCharacter = texture2D(uSprite, spriteCoord);
        
          // vec3 mixed = mix(uHighlightColour, 1.0 - uBackgroundColour, (1.0 - baseColor.r) * uHighlightFalloff);

          float colourContrast = max((color.x - 0.5) * 3.0 + 0.5, 0.0);

          vec3 mixed = mix(vec3(1.0 - uBackgroundColour), uHighlightColour, min(colourContrast * uHighlightFalloff, 1.0));

          vec3 final = mix(uBackgroundColour, mixed, asciiCharacter.r);
          gl_FragColor = vec4(final, 1.0);

          
          // gl_FragColor = texture2D(uTextureDraw, texCoords);
          // gl_FragColor = vec4(vec3(spriteCoord, 1.0), 1.0);
          // gl_FragColor = vec4(final, 1.0);

        }
    `;

    const postProcessVertexShader = createShader(gl, gl.VERTEX_SHADER, postProcessVertexShaderSource);
    const postProcessFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, postProcessFragmentShaderSource);
    const postProcessProgram = createProgram(gl, postProcessVertexShader, postProcessFragmentShader);

    gl.useProgram(postProcessProgram);

    const uTime = gl.getUniformLocation(postProcessProgram, 'uTime');
    gl.uniform1f(uTime, 0);

    const textureUniformLocation = gl.getUniformLocation(postProcessProgram, 'uTextureDraw');
    gl.uniform1i(textureUniformLocation, 1);

    // Create the framebuffer
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width / 10, canvas.height / 10, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    

    // ASCII Sprite
    const sprite = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, sprite);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    gl.uniform1i(gl.getUniformLocation(postProcessProgram, 'uSprite'), 2);

    // Resolution
    const uResolution = gl.getUniformLocation(postProcessProgram, 'uResolution');
    gl.uniform2f(uResolution, Math.max(canvas.width / canvas.height, 1), Math.max(canvas.height / canvas.width, 1));

    return {
      buffer: framebuffer,
      texture: texture,
      program: postProcessProgram,
      uniforms: {
        resolution: uResolution,
        time: uTime
      },
    };
  };

  const loadTexture = async (url) => {
      return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = url;
      });
  };

  const loadVideo = (url) => {
      return new Promise((resolve, reject) => {
          const video = document.createElement("video");
          video.src = url;

          video.playsInline = true;
          video.muted = true;
          video.loop = true;

          video.play();

          video.addEventListener("canplay", onPlaying, false);
          video.addEventListener("durationchange", onTimeUpdate, false);

          let playing = false;
          let timeupdate = false;

          function onPlaying() {
              playing = true;
              checkReady();
          }

          function onTimeUpdate() {
              timeupdate = true;
              checkReady();
          }


          function checkReady() {
              if (playing && timeupdate) {
                  resolve(video);
              }
          }
      });
  };

  let asciiDefaultColour = [211, 241, 0];

  const init = () => {
      const canvas = document.querySelector('#hero');
      let startTime = 0;
      let yOffset = 0;

      const controls = {
          strokeWidth: 0.32,
          strokeDecay: 0.07,
          asciiScale: 27,
          noiseScale: 2.1,
          noiseScaleDetail: 8,
          noiseSpeed: 0.17,
          noiseContrast: 1.15,
          noiseBrightness: -0.55,
          noiseDisplacement: 0.1,
          aberrationBase: 0.0,
          aberrationChaos: 0.01,
          // colour: [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)],
          colour: asciiDefaultColour,
          lensDistortion: 0.32,
          lensDistortionEased: 0.05,
          mouseEasing: 1.5,
          liquidSpin: 0.03,
          viscosity: 0.16,
          logoFalloff: 3,
          highlightFalloff: 0.8,
          lightMode: false,
      };

      const wrapper = document.querySelector('.heroWrapper');
      const controlContainer = document.querySelector('.heroControlsRight');
      const controlContainerLeft = document.querySelector('.heroControlsLeft');

      wrapper.style.setProperty('--slider-colour', `rgb(${controls.colour[0]},${controls.colour[1]},${controls.colour[2]})`);
      wrapper.style.setProperty('--theme-bg', `#000000`);
      wrapper.style.setProperty('--theme-text', `#ffffff`);

      const addControl = (prop, min, max, step) => {
          const itemWrapper = document.createElement('div');

          itemWrapper.innerHTML = `
            <div>
                <input type="range" min="${min}" max="${max}" value="${controls[prop]}" class="controlsSlider" step=${step}>
                <span></span>
                <div class="controlsSliderValue"></div>
            </div>
            <p>${prop}</p>`;

          controlContainer.appendChild(itemWrapper);

          const input = itemWrapper.querySelector('input');
          const percentageDisplay = itemWrapper.querySelector('span');

          const updateControls = (value) => {
              const percentage = Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100);

              const thumbWidth = percentage + '%';
              itemWrapper.style.setProperty('--thumb-width', thumbWidth);

              percentageDisplay.textContent = `${parseInt(percentage, 10)}%`;

              controls[prop] = parseFloat(value);
          };

          input.addEventListener('input', (e) => updateControls(e.target.value));

          updateControls(controls[prop]);

      };

      const addColourControl = () => {
          const itemWrapper = document.createElement('div');

          const rgbToHex = (rgbArray) => {
              const componentToHex = (c) => {
                  const hex = c.toString(16);
                  return hex.length === 1 ? '0' + hex : hex;
              };

              const [r, g, b] = rgbArray;
              return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
          };

          const hexToRgb = (hex) => {
              hex = hex.replace(/^#/, '');

              const bigint = parseInt(hex, 16);
              const r = (bigint >> 16) & 255;
              const g = (bigint >> 8) & 255;
              const b = bigint & 255;

              return [r, g, b];
          };

          itemWrapper.innerHTML = `
            <div class="colourPicker">
                <input type="color" value="${rgbToHex(controls.colour)}" >
                <p>Colour</p>
            </div>
        `;

          controlContainerLeft.appendChild(itemWrapper);

          const input = itemWrapper.querySelector('input');

          const updateControls = (value) => {
              const rgb = hexToRgb(value);
              wrapper.style.setProperty('--slider-colour', `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
              controls.colour = rgb;
          };

          input.addEventListener('input', (e) => updateControls(e.target.value));
      };

      const addThemeControl = () => {
          const itemWrapper = document.createElement('div');

          itemWrapper.innerHTML = `
            <div class="themePicker">
                <div>
                    <button class="active">Dark</button>
                    <button>Light</button>
                </div>
                <p>Mode</p>
            </div>
        `;

          controlContainerLeft.appendChild(itemWrapper);

          const buttons = itemWrapper.querySelectorAll('button');

          const updateControls = (btn) => {
              if (btn.innerHTML === 'Light') {
                  controls.lightMode = true;
                  wrapper.style.setProperty('--theme-bg', `#ffffff`);
                  wrapper.style.setProperty('--theme-text', `#000000`);
              } else {
                  controls.lightMode = false;
                  wrapper.style.setProperty('--theme-bg', `#000000`);
                  wrapper.style.setProperty('--theme-text', `#ffffff`);
              }

              [...buttons].forEach((btn) => btn.classList.remove('active'));
              btn.classList.add('active');
          };

          [...buttons].forEach((btn) => btn.addEventListener('click', (e) => updateControls(e.target)));
      };

      addControl('strokeWidth', 0, 1, 0.01);
      addControl('strokeDecay', 0, 0.5, 0.01);
      addControl('mouseEasing', 1, 10, 0.01);
      addControl('lensDistortion', 0, 1, 0.01);
      addControl('asciiScale', 5, 100, 1);

      addControl('noiseContrast', 0, 5, 0.01);
      addControl('noiseScale', 1, 10, 0.01);
      addControl('noiseSpeed', 0, 2, 0.01);
      addControl('noiseBrightness', -1, 1, 0.01);
      addControl('viscosity', 0.1, 1, 0.01);

      addColourControl();
      addThemeControl();

      const numberOfPositions = 50;
      const numberOfPoints = 20;
      const subDivs = 100;

      const mouse = { x: 0, y: 0 };
      const mouseEased = { x: 0, y: 0 };
      const lastMouse = { x: 0, y: 0 };
      let mouseDelta = {
          total: 0,
          x: 0,
          y: 0,
      };
      let isMouseDown = false;
      let spinDelta = 0;

      const createShader = async () => {
          const positionsArray = Array(numberOfPositions).fill([0, 0]);

          const sprite = await loadTexture('./img/ascii-sprite.png');
          const face = await loadVideo('./video/20S-loop-edited.mp4');


          const dpi = window.devicePixelRatio;

          canvas.width = window.innerWidth * dpi;
          canvas.height = canvas.offsetHeight * dpi;

          const gl = canvas.getContext('webgl');

          const vertices = subdivideVertices(subDivs);
          const numVertices = vertices.length / 2;

          const drawShader = addShader(gl, vertices, numberOfPoints, canvas, face);
          drawShader.uniforms.noiseScale = gl.getUniformLocation(drawShader.program, 'uNoiseScale');
          drawShader.uniforms.noiseSpeed = gl.getUniformLocation(drawShader.program, 'uNoiseSpeed');
          drawShader.uniforms.noiseContrast = gl.getUniformLocation(drawShader.program, 'uNoiseContrast');
          drawShader.uniforms.noiseBrightness = gl.getUniformLocation(drawShader.program, 'uNoiseBrightness');
          drawShader.uniforms.logoFalloff = gl.getUniformLocation(drawShader.program, 'uLogoFalloff');

          const blurPass = addBlurPass(gl, canvas);
          blurPass.uniforms.aberrationChaos = gl.getUniformLocation(blurPass.program, 'uAberrationChaos');
          blurPass.uniforms.aberrationBase = gl.getUniformLocation(blurPass.program, 'uAberrationBase');
          blurPass.uniforms.lensDistortion = gl.getUniformLocation(blurPass.program, 'uLensDistortion');

          const ASCIIPass = addASCIIPass(gl, canvas, sprite);
          ASCIIPass.uniforms.asciiScale = gl.getUniformLocation(ASCIIPass.program, 'uAsciiScale');
          ASCIIPass.uniforms.highlightColour = gl.getUniformLocation(ASCIIPass.program, 'uHighlightColour');
          ASCIIPass.uniforms.backgroundColour = gl.getUniformLocation(ASCIIPass.program, 'uBackgroundColour');
          ASCIIPass.uniforms.highlightFalloff = gl.getUniformLocation(ASCIIPass.program, 'uHighlightFalloff');

          const renderShader = (time) => {
              gl.useProgram(drawShader.program);

              // Update time uniform
              gl.uniform1f(drawShader.uniforms.time, time);

              gl.uniform2f(drawShader.uniforms.noiseScale, controls.noiseScale, controls.noiseScaleDetail);
              gl.uniform1f(drawShader.uniforms.noiseSpeed, controls.noiseSpeed);
              gl.uniform1f(drawShader.uniforms.noiseContrast, controls.noiseContrast);
              gl.uniform1f(drawShader.uniforms.noiseBrightness, controls.noiseBrightness);
              gl.uniform1f(drawShader.uniforms.logoFalloff, controls.logoFalloff);


              // Update the video texture 
              gl.activeTexture(gl.TEXTURE3);
              gl.bindTexture(gl.TEXTURE_2D, drawShader.uniforms.face.texture);
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, face);

              if (positionsArray.length > numberOfPositions) {
                  positionsArray.shift();
              }

              mouseEased.x += (mouse.x - mouseEased.x) / controls.mouseEasing;
              mouseEased.y += (mouse.y - mouseEased.y) / controls.mouseEasing;

              const mouseCurveArr = [
                  [mouseEased.x, mouseEased.y],
                  [lastMouse.x, lastMouse.y],
              ];

              const lastMouseCurve = interpolatePoints(mouseCurveArr, 20);

              // Update brightnesses
              const x = Math.max(canvas.width / canvas.height, 1);
              const y = Math.max(canvas.height / canvas.width, 1);

              mouseDelta.x = lastMouse.x - mouseEased.x;
              mouseDelta.y = lastMouse.y - mouseEased.y;

              // Update flow uniform
              const flowDistance = controls.noiseDisplacement * 1.5 / 10;
              drawShader.uniforms.uFlow.velocity.x += mouseDelta.x * flowDistance;
              drawShader.uniforms.uFlow.velocity.x *= 0.98;
              drawShader.uniforms.uFlow.velocity.y += mouseDelta.y * flowDistance;
              drawShader.uniforms.uFlow.velocity.y *= 0.98;

              drawShader.uniforms.uFlow.data.x += drawShader.uniforms.uFlow.velocity.x;
              drawShader.uniforms.uFlow.data.y += drawShader.uniforms.uFlow.velocity.y;

              gl.uniform2f(drawShader.uniforms.uFlow.location, drawShader.uniforms.uFlow.data.x, drawShader.uniforms.uFlow.data.y);

              const spinX = mouseDelta.x * controls.liquidSpin * (mouseEased.y * 2 - 1);
              const spinY = mouseDelta.y * controls.liquidSpin * (mouseEased.x * 2 - 1) * -1;

              spinDelta += spinX + spinY;
              spinDelta *= 1 - controls.viscosity / 10;

              drawShader.uniforms.spin.data += spinDelta;

              gl.uniform1f(drawShader.uniforms.spin.location, drawShader.uniforms.spin.data);

              mouseDelta.total = Math.min(Math.max(Math.abs(mouseDelta.x), Math.abs(mouseDelta.y)), 1);
              const sizeMutliplier = isMouseDown ? 0.5 : 1;

              gl.uniform1f(drawShader.uniforms.chaos, mouseDelta.total);

              for (let i = 0; i < numVertices; i++) {
                  const normalisedX = (vertices[i * 2] + 1) / 2;
                  const normalisedY = 1 - (vertices[i * 2 + 1] + 1) / 2;


                  for (let j = 0; j < lastMouseCurve.length; j++) {
                      // Brightness
                      const distance =
                          Math.max(1 - Math.sqrt(
                              Math.pow((lastMouseCurve[j][0] - normalisedX) * x * (30 - controls.strokeWidth * 30) * sizeMutliplier * (1 - mouseDelta.total), 2) +
                              Math.pow((lastMouseCurve[j][1] - normalisedY) * y * (30 - controls.strokeWidth * 30) * sizeMutliplier * (1 - mouseDelta.total), 2)
                          ), 0);

                      drawShader.uniforms.brightness.data[i] += distance * mouseDelta.total;

                      // Flow
                      const distanceFlow =
                          Math.max(1 - Math.sqrt(
                              Math.pow((lastMouseCurve[j][0] - normalisedX) * x * 3 * (1 - mouseDelta.total), 2) +
                              Math.pow((lastMouseCurve[j][1] - normalisedY) * y * 3 * (1 - mouseDelta.total), 2)
                          ), 0);

                      drawShader.uniforms.flow.data[i * 2] += distanceFlow * mouseDelta.x * controls.noiseDisplacement;
                      drawShader.uniforms.flow.data[i * 2 + 1] += distanceFlow * mouseDelta.y * controls.noiseDisplacement;
                  }

                  drawShader.uniforms.flow.data[i * 2] *= 0.99;
                  drawShader.uniforms.flow.data[i * 2 + 1] *= 0.99;

                  drawShader.uniforms.brightness.data[i] *= 1 - (controls.strokeDecay / 10);
                  drawShader.uniforms.brightness.data[i] = Math.max(Math.min(drawShader.uniforms.brightness.data[i], 1), 0);
              }

              lastMouse.x = mouseEased.x;
              lastMouse.y = mouseEased.y;

              // Update the brightness buffer
              gl.bindBuffer(gl.ARRAY_BUFFER, drawShader.uniforms.brightness.buffer);
              gl.bufferData(gl.ARRAY_BUFFER, drawShader.uniforms.brightness.data, gl.STATIC_DRAW);

              // Update the flow buffer
              gl.bindBuffer(gl.ARRAY_BUFFER, drawShader.uniforms.flow.buffer);
              gl.bufferData(gl.ARRAY_BUFFER, drawShader.uniforms.flow.data, gl.STATIC_DRAW);

              gl.bindFramebuffer(gl.FRAMEBUFFER, ASCIIPass.buffer);
              gl.viewport(0, 0, canvas.width / 10, canvas.height / 10);
              gl.drawArrays(gl.TRIANGLE_STRIP, 0, numVertices);
          };

          const renderASCII = (time) => {
              gl.bindFramebuffer(gl.FRAMEBUFFER, null);
              gl.viewport(0, 0, canvas.width, canvas.height);

              gl.clear(gl.COLOR_BUFFER_BIT);
              gl.useProgram(ASCIIPass.program);

              gl.uniform1f(ASCIIPass.uniforms.asciiScale, Math.floor(controls.asciiScale * ((canvas.height / canvas.width) * (window.innerWidth / 700))));
              gl.uniform1f(ASCIIPass.uniforms.highlightFalloff, controls.highlightFalloff);

              // Highlight color
              gl.uniform3f(ASCIIPass.uniforms.highlightColour, controls.colour[0] / 255, controls.colour[1] / 255, controls.colour[2] / 255);

              // BG color
              const backgroundColour = controls.lightMode ? [245, 243, 241] : [0, 0, 0];
              gl.uniform3f(ASCIIPass.uniforms.backgroundColour, backgroundColour[0] / 255, backgroundColour[1] / 255, backgroundColour[2] / 255);

              gl.uniform1f(ASCIIPass.uniforms.time, time);

              gl.bindFramebuffer(gl.FRAMEBUFFER, blurPass.buffer);

              gl.drawArrays(gl.TRIANGLE_STRIP, 0, numVertices);


          };

          const renderBlur = () => {
              gl.bindFramebuffer(gl.FRAMEBUFFER, null);
              gl.clear(gl.COLOR_BUFFER_BIT);
              gl.useProgram(blurPass.program);

              gl.uniform3f(blurPass.uniforms.chaos, mouseDelta.total, mouseDelta.x, mouseDelta.y);

              gl.uniform1f(blurPass.uniforms.aberrationChaos, controls.aberrationChaos);
              gl.uniform1f(blurPass.uniforms.aberrationBase, controls.aberrationBase);


              const lensDistortionScaled = controls.lensDistortion * (isMouseDown ? 2 : 1);
              controls.lensDistortionEased += (lensDistortionScaled - controls.lensDistortionEased) / 10;

              gl.uniform1f(blurPass.uniforms.lensDistortion, controls.lensDistortionEased);

              gl.drawArrays(gl.TRIANGLE_STRIP, 0, numVertices);
              gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          };

          const render = (timestamp) => {
              // Calculate time
              if (!startTime) {
                  startTime = timestamp;
              }

              const elapsedTime = timestamp - startTime;

              renderShader(elapsedTime);
              renderASCII(elapsedTime);
              renderBlur();

              window.requestAnimationFrame(render);
          };

          const handleResize = () => {
              canvas.height = '';
              canvas.width = window.innerWidth * dpi;
              canvas.height = canvas.offsetHeight * dpi;

              const resolution = [
                  Math.max(canvas.width / canvas.height, 1),
                  Math.max(canvas.height / canvas.width, 1)
              ];

              // Draw
              gl.useProgram(drawShader.program);
              gl.uniform2f(drawShader.uniforms.resolution, resolution[0], resolution[1]);

              // Ascii
              gl.useProgram(ASCIIPass.program);
              gl.uniform2f(ASCIIPass.uniforms.resolution, resolution[0], resolution[1]);

              gl.bindFramebuffer(gl.FRAMEBUFFER, ASCIIPass.buffer);

              gl.activeTexture(gl.TEXTURE1);
              gl.bindTexture(gl.TEXTURE_2D, ASCIIPass.texture);

              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width / 10, canvas.height / 10, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

              // Blur
              gl.useProgram(blurPass.program);
              gl.uniform2f(blurPass.uniforms.resolution, resolution[0], resolution[1]);

              gl.bindFramebuffer(gl.FRAMEBUFFER, blurPass.buffer);

              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, blurPass.texture);

              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);


              if (controlsOpen) {
                  yOffset = controlsDrawer.offsetHeight;
                  canvas.style.transform = `translateY(${yOffset - 1}px)`;
              }
          };

          let startX = 0;

          const handleMouseMove = (e) => {
              e.preventDefault();
              const x = e.touches?.length ? e.touches[0]?.pageX : e.pageX;
              const y = e.touches?.length ? e.touches[0]?.pageY : e.pageY;
              // Get the mouse position relative to the viewport
              const mouseX = x;
              const mouseY = y - yOffset + window.scrollY - canvas.offsetTop;

              mouse.x = mouseX / window.innerWidth;
              mouse.y = mouseY / canvas.offsetHeight;

              if (Math.abs(startX - x) > 10) {
                  canvas.style.touchAction = 'none';
              }
          };

          const handleMouseDown = (e) => {
              const x = e.touches?.length ? e.touches[0]?.pageX : e.pageX;
              startX = x;

              isMouseDown = true;
          };

          const handleMouseUp = () => {
              isMouseDown = false;
              startX = 0;
              canvas.style.touchAction = '';
          };

          window.requestAnimationFrame(render);
          window.addEventListener('resize', handleResize);
          canvas.addEventListener('pointermove', handleMouseMove);
          canvas.addEventListener('pointerdown', handleMouseDown);
          canvas.addEventListener('pointerdown', handleMouseMove);
          window.addEventListener('pointerup', handleMouseUp);

          let controlsOpen = false;
          const controlsButton = document.querySelector('.heroControlsToggle');
          const controlsDrawer = document.querySelector('.heroControls');

          controlsButton.addEventListener('click', () => {
              controlsOpen = !controlsOpen;

              if (controlsOpen) {
                  yOffset = controlsDrawer.offsetHeight;
                  controlsDrawer.classList.add('active');
                  controlsDrawer.parentElement.classList.add('active');
                  canvas.style.transform = `translateY(${yOffset - 1}px)`;
                  controlsButton.children[0].innerText = 'Hide controls';
              } else {
                  yOffset = 0;
                  controlsDrawer.classList.remove('active');
                  controlsDrawer.parentElement.classList.remove('active');
                  canvas.style.transform = `translateY(0)`;
                  controlsButton.children[0].innerText = 'Show controls';
              }
          });
      };

      createShader();
  };

  // window.addEventListener("load", (event) => {
  //     init();
  // });

  window.addEventListener('message', event => {
      asciiDefaultColour = event.data;
      init();
  });

})();
