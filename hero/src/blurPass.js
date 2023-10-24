import { createProgram, createShader } from './helpers';

export const addBlurPass = (gl, canvas) => {
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
