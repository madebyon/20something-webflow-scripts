import { getTotalLength, interpolatePoints } from './distibutePoints';
import { subdivideVertices } from './subdivideVertices';
import { addBlurPass } from './blurPass';
import { addShader } from './drawShader';
import { addASCIIPass } from './ASCIIPass';

const loadTexture = async (url) => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
    });
}

let asciiDefaultColour = [211, 241, 0];

const init = () => {
    const canvas = document.querySelector('#hero');
    let startTime = 0;
    let frame = 0;
    let yOffset = 0;

    const controls = {
        strokeWidth: 0.35,
        strokeDecay: 0.1,
        asciiScale: 60,
        noiseScale: 2,
        noiseScaleDetail: 8,
        noiseSpeed: 0.5,
        noiseContrast: 0.46,
        noiseBrightness: -0.51,
        noiseDisplacement: 0.1,
        aberrationBase: 0.0,
        aberrationChaos: 0.01,
        // colour: [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)],
        colour: asciiDefaultColour,
        lensDistortion: 0.05,
        lensDistortionEased: 0.05,
        mouseEasing: 3,
        liquidSpin: 0.03,
        viscosity: 0.2,
        logoFalloff: 3,
        highlightFalloff: 0.8,
        lightMode: false,
    }

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
            <p>${prop}</p>`

        controlContainer.appendChild(itemWrapper)

        const input = itemWrapper.querySelector('input');
        const percentageDisplay = itemWrapper.querySelector('span');

        const updateControls = (value) => {
            const percentage = Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100);

            const thumbWidth = percentage + '%';
            itemWrapper.style.setProperty('--thumb-width', thumbWidth);

            percentageDisplay.textContent = `${parseInt(percentage, 10)}%`;

            controls[prop] = parseFloat(value);
        }

        input.addEventListener('input', (e) => updateControls(e.target.value));

        updateControls(controls[prop]);

    }

    const addColourControl = () => {
        const itemWrapper = document.createElement('div');

        const rgbToHex = (rgbArray) => {
            const componentToHex = (c) => {
                const hex = c.toString(16);
                return hex.length === 1 ? '0' + hex : hex;
            };

            const [r, g, b] = rgbArray;
            return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
        }

        const hexToRgb = (hex) => {
            hex = hex.replace(/^#/, '');

            const bigint = parseInt(hex, 16);
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;

            return [r, g, b];
        }

        itemWrapper.innerHTML = `
            <div class="colourPicker">
                <input type="color" value="${rgbToHex(controls.colour)}" >
                <p>Colour</p>
            </div>
        `

        controlContainerLeft.appendChild(itemWrapper)

        const input = itemWrapper.querySelector('input');

        const updateControls = (value) => {
            const rgb = hexToRgb(value);
            wrapper.style.setProperty('--slider-colour', `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
            controls.colour = rgb;
        }

        input.addEventListener('input', (e) => updateControls(e.target.value));
    }

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
        `

        controlContainerLeft.appendChild(itemWrapper)

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
        }

        [...buttons].forEach((btn) => btn.addEventListener('click', (e) => updateControls(e.target)));
    }

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
        const face = await loadTexture('./img/20s-face-blur.png');
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

            frame = window.requestAnimationFrame(render);
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
                canvas.style.touchAction = 'none'
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
            canvas.style.touchAction = ''
        };

        frame = window.requestAnimationFrame(render);
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
        })
    };

    createShader();
};

window.addEventListener('message', event => {
    asciiDefaultColour = event.data;
    init();
});