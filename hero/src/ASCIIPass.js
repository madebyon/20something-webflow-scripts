import { createProgram, createShader } from './helpers';

export const addASCIIPass = (gl, canvas, img) => {
  // Create vertex shader for post-processing effect
  const postProcessVertexShaderSource = `
        attribute vec2 position;
        varying vec2 texCoords;
        uniform vec2 uResolution;
    
        void main() {
            texCoords = (position + 1.0) * 0.5;
            // texCoords *= uResolution;
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
