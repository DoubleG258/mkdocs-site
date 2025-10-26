"use strict"

const { vec3, vec4, mat4 } = glMatrix;

var canvas;
var gl;

var eye;
var mvMatrix = mat4.create();
var pMatrix = mat4.create(); // LookAt matrix and projection matrix in ortho
var modelViewMatrix, projectionMatrix;

var numVertices = 36; // cube divide into triangles

var points = [];
var colors = [];

// parameters for viewing
var near = -1.0;
var far = 1.0;
var radius = 1.0;
var theta = 0.0; // polar angle [0, PI]
var phi = 0.0;   // azimuthal angle [0, 2PI]
var dtheta = 5.0 * Math.PI / 180.0;

var left = -1.0;
var right = 1.0;
var ytop = 1.0;
var ybottom = -1.0;

// object translation (interactive)
var tx = 0.0, ty = 0.0, tz = 0.0;

const eyeat = vec3.fromValues(0.0, 0.0, 0.0);
const eyeup = vec3.fromValues(0.0, 1.0, 0.0);

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
        1, 0, 3, 1, 3, 2, // 正
        2, 3, 7, 2, 7, 6, // 右
        3, 0, 4, 3, 4, 7, // 底
        6, 5, 1, 6, 1, 2, // 顶
        4, 5, 6, 4, 6, 7, // 背
        5, 4, 0, 5, 0, 1  // 左
    ];

    for (var i = 0; i < faces.length; i++) {
        points.push(vertices[faces[i]][0], vertices[faces[i]][1], vertices[faces[i]][2]);
        var id = Math.floor(i / 6);
        colors.push(vertexColors[id][0], vertexColors[id][1], vertexColors[id][2], vertexColors[id][3]);
    }
}

function initCube() {
    canvas = document.getElementById("proj-canvas");

    gl = canvas.getContext("webgl2");
    if (!gl) {
        alert("WebGL isn't available");
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
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
    gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    modelViewMatrix = gl.getUniformLocation(program, "modelViewMatrix");
    projectionMatrix = gl.getUniformLocation(program, "projectionMatrix");

    // buttons to change viewing parameters
    document.getElementById("btn1").onclick = function () { near *= 1.1; far *= 1.1; };
    document.getElementById("btn2").onclick = function () { near *= 0.9; far *= 0.9; };
    document.getElementById("btn3").onclick = function () { radius *= 1.1; };
    document.getElementById("btn4").onclick = function () { radius *= 0.9; };
    document.getElementById("btn5").onclick = function () { theta += dtheta; if (theta > Math.PI) theta -= 2 * Math.PI; };
    document.getElementById("btn6").onclick = function () { theta -= dtheta; if (theta < -Math.PI) theta += 2 * Math.PI; };
    document.getElementById("btn7").onclick = function () { phi += dtheta; };
    document.getElementById("btn8").onclick = function () { phi -= dtheta; };

    // sliders: object translation; buttons: ortho zoom
    document.getElementById("tx").oninput = function () { tx = parseFloat(this.value); };
    document.getElementById("ty").oninput = function () { ty = parseFloat(this.value); };
    document.getElementById("tz").oninput = function () { tz = parseFloat(this.value); };

    document.getElementById("btn9").onclick = function () {
        left *= 0.9; right *= 0.9; ytop *= 0.9; ybottom *= 0.9;
    };
    document.getElementById("btn10").onclick = function () {
        left *= 1.1; right *= 1.1; ytop *= 1.1; ybottom *= 1.1;
    };

    // 键盘交互：移动物体、调整视点、缩放正交体与复位
    window.addEventListener("keydown", function (e) {
        switch (e.key) {
            case "ArrowLeft":
                tx = Math.max(-1.0, tx - moveStep);
                document.getElementById("tx").value = tx;
                break;
            case "ArrowRight":
                tx = Math.min(1.0, tx + moveStep);
                document.getElementById("tx").value = tx;
                break;
            case "ArrowUp":
                ty = Math.min(1.0, ty + moveStep);
                document.getElementById("ty").value = ty;
                break;
            case "ArrowDown":
                ty = Math.max(-1.0, ty - moveStep);
                document.getElementById("ty").value = ty;
                break;

            case "w": case "W":
                theta += dtheta; if (theta > Math.PI) theta -= 2 * Math.PI;
                break;
            case "s": case "S":
                theta -= dtheta; if (theta < -Math.PI) theta += 2 * Math.PI;
                break;
            case "a": case "A":
                phi -= dtheta;
                break;
            case "d": case "D":
                phi += dtheta;
                break;

            case "-":
                radius *= 1.1;
                break;
            case "+": case "=":
                radius *= 0.9;
                break;

            case "[":
                left *= 0.9; right *= 0.9; ytop *= 0.9; ybottom *= 0.9;
                break;
            case "]":
                left *= 1.1; right *= 1.1; ytop *= 1.1; ybottom *= 1.1;
                break;

            case "r": case "R":
                near = 0.01; far = 4.0; radius = 1.0; theta = 0.0; phi = 0.0;
                tx = 0.0; ty = 0.0; tz = 0.0;
                left = -1.0; right = 1.0; ytop = 1.0; ybottom = -1.0;
                document.getElementById("tx").value = tx;
                document.getElementById("ty").value = ty;
                document.getElementById("tz").value = tz;
                break;
        }
    });

    render();
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 改为绕 y 轴的 yaw/pitch（phi 水平旋转，theta 俯仰）
    eye = vec3.fromValues(
        radius * Math.cos(theta) * Math.sin(phi),
        radius * Math.sin(theta),
        radius * Math.cos(theta) * Math.cos(phi)
    );

    mat4.lookAt(mvMatrix, eye, eyeat, eyeup);
    mat4.translate(mvMatrix, mvMatrix, vec3.fromValues(tx, ty, tz));
    mat4.ortho(pMatrix, left, right, ybottom, ytop, near, far);

    gl.uniformMatrix4fv(modelViewMatrix, false, new Float32Array(mvMatrix));
    gl.uniformMatrix4fv(projectionMatrix, false, new Float32Array(pMatrix));

    gl.drawArrays(gl.TRIANGLES, 0, points.length / 3);
    requestAnimFrame(render);
}