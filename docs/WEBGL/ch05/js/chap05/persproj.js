"use strict";

const { vec3, vec4, mat4 } = glMatrix;

var canvas;
var gl;

var NumVertices = 36;

var points = [];
var colors = [];

// 相机与投影参数（可交互）
var near = 0.1;
var far = 5.0;
var radius = 4.0;
var theta = 0.0;                 // 极角 [0, PI]
var phi = 0.0;                   // 方位角 [0, 2PI]
var dtheta = 5.0 * Math.PI / 180.0;

var fovy = 45.0 * Math.PI / 180.0;  // 纵向视场角（弧度）
var aspect;                          // 视口宽高比
var minFovy = 10.0 * Math.PI / 180.0;
var maxFovy = 90.0 * Math.PI / 180.0;

// 模型视图与投影矩阵
var mvMatrix = mat4.create();
var pMatrix = mat4.create();
var modelViewMatrix, projectionMatrix;

// 物体平移（滑块控制）
var tx = 0.0, ty = 0.0, tz = 0.0;

var eye;
const at = vec3.fromValues(0.0, 0.0, 0.0);
const up = vec3.fromValues(0.0, 1.0, 0.0);

var currentKey = [];

function handleKeyDown() {
    var key = event.keyCode;
    currentKey[key] = true;
    switch (key) {
        case 37: //left
            phi += dtheta;
            break;
        case 39: // right
            phi -= dtheta;
            break;
        case 38: // up
            theta += dtheta;
            break;
        case 40: // down
            theta -= dtheta;
            break;
        case 65: // a - near/far bigger
            near *= 1.1;
            far *= 1.1;
            ensureNearFar();
            break;
        case 68: // d - near/far smaller
            near *= 0.9;
            far *= 0.9;
            ensureNearFar();
            break;
        case 87: // w - radius +
            radius *= 1.1;
            break;
        case 83: // s - radius -
            radius *= 0.9;
            break;
    }
    requestAnimFrame(render);
}

function handleKeyUp() {
    currentKey[event.keyCode] = false;
}

function ensureNearFar() {
    // 保证 near > 0 且 far > near
    if (near < 0.01) near = 0.01;
    if (far <= near + 0.01) far = near + 0.01;
}

function clampFovy() {
    if (fovy < minFovy) fovy = minFovy;
    if (fovy > maxFovy) fovy = maxFovy;
}

function makeColorCube() {
    var vertices = [
        vec4.fromValues(-0.5, -0.5, 0.5, 1.0),
        vec4.fromValues(-0.5, 0.5, 0.5, 1.0),
        vec4.fromValues(0.5, 0.5, 0.5, 1.0),
        vec4.fromValues(0.5, -0.5, 0.5, 1.0),
        vec4.fromValues(-0.5, -0.5, -0.5, 1.0),
        vec4.fromValues(-0.5, 0.5, -0.5, 1.0),
        vec4.fromValues(0.5, 0.5, -0.5, 1.0),
        vec4.fromValues(0.5, -0.5, -0.5, 1.0)
    ];

    var vertexColors = [
        vec4.fromValues(0.0, 0.0, 0.0, 1.0),
        vec4.fromValues(1.0, 0.0, 0.0, 1.0),
        vec4.fromValues(1.0, 1.0, 0.0, 1.0),
        vec4.fromValues(0.0, 1.0, 0.0, 1.0),
        vec4.fromValues(0.0, 0.0, 1.0, 1.0),
        vec4.fromValues(1.0, 0.0, 1.0, 1.0),
        vec4.fromValues(0.0, 1.0, 1.0, 1.0),
        vec4.fromValues(1.0, 1.0, 1.0, 1.0)
    ];

    var faces = [
        1, 0, 3, 1, 3, 2,//正
        2, 3, 7, 2, 7, 6,//右
        3, 0, 4, 3, 4, 7,//底
        6, 5, 1, 6, 1, 2,//顶
        4, 5, 6, 4, 6, 7,//背
        5, 4, 0, 5, 0, 1 //左
    ];

    for (var i = 0; i < faces.length; i++) {
        points.push(vertices[faces[i]][0], vertices[faces[i]][1], vertices[faces[i]][2], vertices[faces[i]][3]);
        var id = Math.floor(i / 6);
        colors.push(vertexColors[id][0], vertexColors[id][1], vertexColors[id][2], vertexColors[id][3]);
    }
}

function initCube() {

    canvas = document.getElementById("gl-canvas");

    gl = canvas.getContext("webgl2");
    if (!gl) { alert("WebGL isn't available"); }

    gl.viewport(0, 0, canvas.width, canvas.height);

    aspect = canvas.width / canvas.height;

    gl.clearColor(1.0, 1.0, 1.0, 1.0);

    gl.enable(gl.DEPTH_TEST);

    var program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    makeColorCube();

    var cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    var vColor = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColor);

    var vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);

    var vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    modelViewMatrix = gl.getUniformLocation(program, "modelViewMatrix");
    projectionMatrix = gl.getUniformLocation(program, "projectionMatrix");

    // 键盘控制
    document.onkeydown = handleKeyDown;
    document.onkeyup = handleKeyUp;

    // 界面按钮控制
    document.getElementById("btn_nf_inc").onclick = function () {
        near *= 1.1; far *= 1.1; ensureNearFar();
    };
    document.getElementById("btn_nf_dec").onclick = function () {
        near *= 0.9; far *= 0.9; ensureNearFar();
    };
    document.getElementById("btn_radius_inc").onclick = function () { radius *= 1.1; };
    document.getElementById("btn_radius_dec").onclick = function () { radius *= 0.9; };

    document.getElementById("btn_theta_inc").onclick = function () { theta += dtheta; };
    document.getElementById("btn_theta_dec").onclick = function () { theta -= dtheta; };
    document.getElementById("btn_phi_inc").onclick = function () { phi += dtheta; };
    document.getElementById("btn_phi_dec").onclick = function () { phi -= dtheta; };

    document.getElementById("btn_fov_inc").onclick = function () { fovy += 5 * Math.PI / 180.0; clampFovy(); };
    document.getElementById("btn_fov_dec").onclick = function () { fovy -= 5 * Math.PI / 180.0; clampFovy(); };

    document.getElementById("btn_reset").onclick = function () {
        near = 0.1; far = 5.0; radius = 4.0;
        theta = 0.0; phi = 0.0; fovy = 45 * Math.PI / 180.0;
        tx = 0.0; ty = 0.0; tz = 0.0;
        document.getElementById("tx").value = "0";
        document.getElementById("ty").value = "0";
        document.getElementById("tz").value = "0";
    };

    // 物体平移滑块
    document.getElementById("tx").oninput = function () { tx = parseFloat(this.value); };
    document.getElementById("ty").oninput = function () { ty = parseFloat(this.value); };
    document.getElementById("tz").oninput = function () { tz = parseFloat(this.value); };

    render();
}

var render = function () {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 改为绕 y 轴的 yaw/pitch（phi 水平旋转，theta 俯仰）
    eye = vec3.fromValues(
        radius * Math.cos(theta) * Math.sin(phi),
        radius * Math.sin(theta),
        radius * Math.cos(theta) * Math.cos(phi)
    );

    mat4.lookAt(mvMatrix, eye, at, up);

    // 对物体应用平移（改变物体位置）
    mat4.translate(mvMatrix, mvMatrix, vec3.fromValues(tx, ty, tz));

    mat4.perspective(pMatrix, fovy, aspect, near, far);

    gl.uniformMatrix4fv(modelViewMatrix, false, new Float32Array(mvMatrix));
    gl.uniformMatrix4fv(projectionMatrix, false, new Float32Array(pMatrix));

    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);
    requestAnimFrame(render);
}