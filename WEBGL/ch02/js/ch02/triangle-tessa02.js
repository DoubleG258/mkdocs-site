"use strict";

const { vec3 } = glMatrix;

var canvas;
var gl;

var points = [];

/** Parameters */
var numTimesToSubdivide = 0; // Default subdivision level
var radius = 1.0;
var rotationAngle = 0; // Rotation angle in degrees

window.onload = function initTriangles() {
    canvas = document.getElementById("gl-canvas");

    gl = canvas.getContext("webgl2");
    if (!gl) {
        alert("WebGL isn't available");
    }

    // Initialize vertices for the Sierpinski gasket
    drawTriangles();

    // Configure WebGL
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);

    // Load shaders and initialize attribute buffers
    var program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // Load data into GPU
    var vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);

    // Associate shader variables with data buffer
    var vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    renderTriangles();
};

function drawTriangles() {
    points = []; // Clear previous points
    var vertices = [
        radius * Math.cos(90 * Math.PI / 180.0), radius * Math.sin(90 * Math.PI / 180.0), 0,
        radius * Math.cos(210 * Math.PI / 180.0), radius * Math.sin(210 * Math.PI / 180.0), 0,
        radius * Math.cos(-30 * Math.PI / 180.0), radius * Math.sin(-30 * Math.PI / 180.0), 0
    ];

    var u = vec3.fromValues(vertices[0], vertices[1], vertices[2]);
    var v = vec3.fromValues(vertices[3], vertices[4], vertices[5]);
    var w = vec3.fromValues(vertices[6], vertices[7], vertices[8]);

    divideTriangle(u, v, w, numTimesToSubdivide);
}

function tessellaTriangle(a, b, c) {
    // Apply rotation to each vertex
    a = rotateVertex(a, rotationAngle);
    b = rotateVertex(b, rotationAngle);
    c = rotateVertex(c, rotationAngle);

    // Push vertices for line drawing (outline of triangles)
    points.push(a[0], a[1], a[2]);
    points.push(b[0], b[1], b[2]);

    points.push(b[0], b[1], b[2]);
    points.push(c[0], c[1], c[2]);

    points.push(c[0], c[1], c[2]);
    points.push(a[0], a[1], a[2]);
}

function divideTriangle(a, b, c, count) {
    // Check for end of recursion
    if (count == 0) {
        tessellaTriangle(a, b, c);
    } else {
        var ab = vec3.create();
        vec3.lerp(ab, a, b, 0.5);
        var bc = vec3.create();
        vec3.lerp(bc, b, c, 0.5);
        var ca = vec3.create();
        vec3.lerp(ca, c, a, 0.5);

        // 递归细分四个子三角形
        // 中心三角形
        divideTriangle(ab, bc, ca, count - 1);
        // 三个角落三角形
        divideTriangle(a, ab, ca, count - 1);
        divideTriangle(ab, b, bc, count - 1);
        divideTriangle(ca, bc, c, count - 1);
    }
}

function rotateVertex(vertex, angle) {
    // Rotate a vertex around the origin by the given angle (in degrees)
    var rad = angle * Math.PI / 180.0; // Convert angle to radians
    var x = vertex[0];
    var y = vertex[1];
    var z = vertex[2];
    var rotatedX = x * Math.cos(rad) - y * Math.sin(rad);
    var rotatedY = x * Math.sin(rad) + y * Math.cos(rad);
    return vec3.fromValues(rotatedX, rotatedY, z);
}

function renderTriangles() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW); // Update buffer data
    gl.drawArrays(gl.LINES, 0, points.length / 3); // Use LINES to draw triangle outlines
}