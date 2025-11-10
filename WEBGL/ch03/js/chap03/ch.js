"use strict";

// 确保正确引用 glMatrix
const mat4 = glMatrix.mat4;

var canvas;
var gl;
var program;

// 变换参数
var transformType = "translate";
var translateX = 0.0;
var translateY = 0.0;
var rotateAngle = 0.0;
var scaleAxis = "both";
var scaleFactor = 1.0;

// 变换矩阵和颜色统一变量位置
var transformMatrixLoc;
var colorLoc;

// 图形顶点数据
var shapes = [
    {
        type: "square",
        vertices: new Float32Array([
            -0.3,  0.3,  0, 1,
            -0.3, -0.3,  0, 1,
             0.3,  0.3,  0, 1,
             0.3, -0.3,  0, 1
        ]),
        color: [1.0, 0.0, 0.0, 1.0], // 红色
        drawMode: null // 将在初始化时设置
    },
    {
        type: "triangle",
        vertices: new Float32Array([
             0.0,  0.5,  0, 1,
            -0.4, -0.2,  0, 1,
             0.4, -0.2,  0, 1
        ]),
        color: [0.0, 0.0, 1.0, 1.0], // 蓝色
        drawMode: null // 将在初始化时设置
    }
];

function initTransformApp() {
    // 获取画布和WebGL上下文
    canvas = document.getElementById("transform-canvas");
    // 尝试获取WebGL 1上下文，增加兼容性
    gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) {
        alert("WebGL isn't available");
        return;
    }

    // 设置绘制模式常量
    shapes[0].drawMode = gl.TRIANGLE_STRIP;
    shapes[1].drawMode = gl.TRIANGLES;

    // 设置视口和清除颜色
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);

    // 加载着色器程序
    program = initShaders(gl, "v-shader", "f-shader");
    if (!program) {
        console.log("Failed to load shaders");
        return;
    }
    gl.useProgram(program);

    // 获取统一变量位置
    transformMatrixLoc = gl.getUniformLocation(program, "transformMatrix");
    colorLoc = gl.getUniformLocation(program, "color");

    // 为每个图形创建缓冲区并渲染
    renderScene();
}

function renderScene() {
    // 清除画布
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 创建变换矩阵
    var transformMatrix = mat4.create();

    // 根据当前选择的变换类型应用变换
    switch(transformType) {
        case "translate":
            mat4.translate(transformMatrix, transformMatrix, [translateX, translateY, 0]);
            break;
        case "rotate":
            mat4.rotateZ(transformMatrix, transformMatrix, rotateAngle * Math.PI / 180.0);
            break;
        case "scale":
            switch(scaleAxis) {
                case "both":
                    mat4.scale(transformMatrix, transformMatrix, [scaleFactor, scaleFactor, 1]);
                    break;
                case "x":
                    mat4.scale(transformMatrix, transformMatrix, [scaleFactor, 1, 1]);
                    break;
                case "y":
                    mat4.scale(transformMatrix, transformMatrix, [1, scaleFactor, 1]);
                    break;
            }
            break;
    }

    // 传递变换矩阵到着色器
    gl.uniformMatrix4fv(transformMatrixLoc, false, transformMatrix);

    // 绘制每个图形
    shapes.forEach(function(shape) {
        // 创建缓冲区
        var bufferId = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
        gl.bufferData(gl.ARRAY_BUFFER, shape.vertices, gl.STATIC_DRAW);

        // 设置顶点属性
        var vPosition = gl.getAttribLocation(program, "vPosition");
        gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vPosition);

        // 设置颜色
        gl.uniform4fv(colorLoc, shape.color);

        // 绘制图形
        gl.drawArrays(shape.drawMode, 0, shape.vertices.length / 4);
    });
}

function updateTransformControls() {
    // 获取当前选择的变换类型
    transformType = document.getElementById("transform-type").value;

    // 显示对应的控件，隐藏其他控件
    document.getElementById("translate-controls").style.display = transformType === "translate" ? "block" : "none";
    document.getElementById("rotate-controls").style.display = transformType === "rotate" ? "block" : "none";
    document.getElementById("scale-controls").style.display = transformType === "scale" ? "block" : "none";

    // 更新变换
    updateTransform();
}

function updateTransform() {
    // 根据当前变换类型获取参数值
    if (transformType === "translate") {
        translateX = parseFloat(document.getElementById("translate-x").value);
        translateY = parseFloat(document.getElementById("translate-y").value);
        document.getElementById("translate-x-value").textContent = translateX.toFixed(2);
        document.getElementById("translate-y-value").textContent = translateY.toFixed(2);
    } else if (transformType === "rotate") {
        rotateAngle = parseFloat(document.getElementById("rotate-angle").value);
        document.getElementById("rotate-angle-value").textContent = rotateAngle.toFixed(0) + "°";
    } else if (transformType === "scale") {
        scaleAxis = document.getElementById("scale-axis").value;
        scaleFactor = parseFloat(document.getElementById("scale-factor").value);
        document.getElementById("scale-factor-value").textContent = scaleFactor.toFixed(1);
    }

    // 重新渲染场景
    renderScene();
}

function resetTransform() {
    // 重置所有变换参数
    translateX = 0.0;
    translateY = 0.0;
    rotateAngle = 0.0;
    scaleFactor = 1.0;

    // 更新控件值
    document.getElementById("translate-x").value = translateX;
    document.getElementById("translate-y").value = translateY;
    document.getElementById("translate-x-value").textContent = translateX.toFixed(2);
    document.getElementById("translate-y-value").textContent = translateY.toFixed(2);
    document.getElementById("rotate-angle").value = rotateAngle;
    document.getElementById("rotate-angle-value").textContent = rotateAngle.toFixed(0) + "°";
    document.getElementById("scale-factor").value = scaleFactor;
    document.getElementById("scale-factor-value").textContent = scaleFactor.toFixed(1);

    // 重新渲染场景
    renderScene();
}

// 当页面加载完成时初始化应用
window.onload = initTransformApp;