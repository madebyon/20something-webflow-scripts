import { createProgram, createShader } from './helpers';
import { glslNoise } from './noise';

export const addShader = (gl, vertices, numberOfPoints, canvas, face) => {
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

  // 20S Face Texture
  const faceTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, faceTexture);
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
      spin: {
        location: uSpin,
        data: 0,
      },
    },
  };
};
