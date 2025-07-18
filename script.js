const canvas = document.querySelector('canvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const gl = canvas.getContext('webgl2', {antialias: false, depth:false});
gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
gl.getExtension('EXT_color_buffer_float');
gl.getExtension('OES_texture_float_linear');


const program = gl.createProgram();
const program2 = gl.createProgram();

const vertShader = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(vertShader, vertShaderSrc);
gl.compileShader(vertShader);
gl.attachShader(program, vertShader);

const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(fragShader, fragShaderSrc);
gl.compileShader(fragShader);
gl.attachShader(program, fragShader);

gl.linkProgram(program);
if(!gl.getProgramParameter(program, gl.LINK_STATUS)){
    console.log('VERTEX_SHADER_ERROR:\n', gl.getShaderInfoLog(vertShader));
    console.log('FRAGMENT_SHADER_ERROR:\n', gl.getShaderInfoLog(fragShader));
}

gl.useProgram(program);
gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), canvas.width, canvas.height);




gl.attachShader(program2, vertShader);

const postShader = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(postShader, postShaderSrc);
gl.compileShader(postShader);
gl.attachShader(program2, postShader);

gl.linkProgram(program2);
if(!gl.getProgramParameter(program2, gl.LINK_STATUS)){
    console.log('POST_PROCESS_ERROR:\n', gl.getShaderInfoLog(postShader));
}
gl.useProgram(program2);

gl.uniform2f(gl.getUniformLocation(program2, 'uResolution'), canvas.width, canvas.height);

let framebuffers = [];
let textures = [];
for(let i = 0; i < 2; i++){
    let tex = createTex();
    textures.push(tex);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null);

    let fb = gl.createFramebuffer();
    framebuffers.push(fb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.error("Framebuffer is not complete");
    }
}

function createTex(){
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
 
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
 
    return texture;
}



/*
    object format
    position x, y 
    radius s
    albedo rgb, alpha a
    emission rgb
    ior

    total floats: 11

*/

const circles = [];

function createCircle({x = 0, y = 0, radius = 0.1, albedo = [1, 1, 1, 0], emission = [0, 0, 0], ior = 1.45, roughness = 0}={}){
    return { x, y, radius, albedo, emission, ior, roughness };
}

function randomCol(n, mult=1){
    return [
        Math.pow( Math.random(), n ) * mult,
        Math.pow( Math.random(), n ) * mult,
        Math.pow( Math.random(), n ) * mult
    ];
}

function createCircles(){

    for(let i = 0; i < 30; i++){
        circles.push( createCircle({
            x:Math.random() * canvas.width/canvas.height,
            y:Math.random(),
            radius:0.01+Math.random()*0.15,
            albedo:(randomCol(0.15)).concat(0),
            ior:1.4+Math.random()*0.1
        }));
    }
    for(let i = 0; i < 3; i++){
        let light = [0, 0, 0];
        circles.push( createCircle({
            x:Math.random() * canvas.width/canvas.height,
            y:Math.random(),
            radius:0.01+Math.random()*0.05,
            albedo:[0, 0, 0, 1],
            emission:randomCol(0.3, 3),

        }));
    }
}

function updateCircles(){
    for(let i = 0; i < circles.length; i++){
        for(let j = 0; j < circles.length; j++){
            if(i == j){ continue; }
            const lx = circles[i].x-circles[j].x;
            const ly = circles[i].y-circles[j].y;
            const d = Math.sqrt( lx*lx + ly*ly );
            const e = circles[i].radius + circles[j].radius + 0.002;
            if(d < e){
                const t = (e-d)*0.5;
                const dx = lx/d;
                const dy = ly/d;
                circles[i].x += dx*t;
                circles[i].y += dy*t;
                circles[j].x -= dx*t;
                circles[j].y -= dy*t;
            }
        }
    }
}


function passData(){
    const circleData = new Float32Array(circles.length * 12);

    for(let i = 0; i < circles.length; i++){
        circleData.set([
            circles[i].x,
            circles[i].y,
            circles[i].radius,
            circles[i].roughness,
            ...circles[i].albedo,
            ...circles[i].emission,
            circles[i].ior,
            ],
            i * 12
        );
    }


    const circleTex = gl.createTexture();

    gl.activeTexture(gl.TEXTURE0);

    gl.bindTexture(gl.TEXTURE_2D, circleTex);
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA32F, 3, circles.length, 0, gl.RGBA, gl.FLOAT, circleData );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, 'uCircles'), 0);

    gl.uniform1i(gl.getUniformLocation(program, 'uNumCircles'), circles.length);

    gl.uniform1f(gl.getUniformLocation(program, 'uFrame'), frame);

}

createCircles();
for(let i = 0; i < circles.length; i++){
    updateCircles();
}

let currentFb = 0;

let frame = 0;

let isMouseDown = false;
let currentGrab = -1;
let offsetx, offsety;

document.addEventListener('mousedown', (event) => {
    isMouseDown = true;
    const mousex = event.clientX/canvas.height;
    const mousey = 1-(event.clientY/canvas.height);

    let min = 1e10;


    for(let i = 0; i < circles.length; i++){
        const dx = circles[i].x - mousex;
        const dy = circles[i].y - mousey;
        const d = Math.sqrt(dx*dx + dy*dy);
        if(d < min && d < circles[i].radius){
            min = d;
            currentGrab = i;
            offsetx = dx;
            offsety = dy;
        }
    }
    console.log(currentGrab);
});

document.addEventListener('mouseup', () => {
    isMouseDown = false;
    currentGrab = -1;
});

document.addEventListener('mousemove', (event) => {
    if(isMouseDown && currentGrab != -1){
        const mousex = event.clientX/canvas.height;
        const mousey = 1-(event.clientY/canvas.height);
        circles[currentGrab].x = mousex + offsetx;
        circles[currentGrab].y = mousey + offsety;
        frame = 0;
        for(let i = 0; i < 10; i++){
            updateCircles();
        }
    }
});


function draw(){

    passData();

    gl.useProgram(program);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[currentFb]);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures[1-currentFb]);
    gl.uniform1i(gl.getUniformLocation(program, 'uLastFrame'), 1);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);


    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.useProgram(program2);

    
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures[currentFb]);
    gl.uniform1i(gl.getUniformLocation(program2, 'uTexLoc'), 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);


    frame++;
    currentFb = 1-currentFb;
    requestAnimationFrame(draw);
}
draw();