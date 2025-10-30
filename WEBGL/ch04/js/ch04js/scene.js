"use strict";

const { mat4, vec3, vec4 } = glMatrix;

// 全局变量
var canvas, gl;
var program;
var shapes = [];
var currentShapeType = 'triangle';
var currentColor = [1.0, 0.0, 0.0, 1.0]; // 红色
var shapeSize = 0.1;
var circleSides = 32;

// 着色器程序变量
var uModelMatrix, uViewMatrix, uProjectionMatrix;
var vPosition, vColor;

// 动画参数
var animationTime = 0;

function initScene() {
    canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext("webgl2");
    
    if (!gl) {
        alert("WebGL 2.0 不可用");
        return;
    }

    // 初始化WebGL设置
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.95, 0.95, 0.95, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 初始化着色器程序
    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // 获取uniform和attribute位置
    uModelMatrix = gl.getUniformLocation(program, "uModelMatrix");
    uViewMatrix = gl.getUniformLocation(program, "uViewMatrix");
    uProjectionMatrix = gl.getUniformLocation(program, "uProjectionMatrix");
    
    vPosition = gl.getAttribLocation(program, "vPosition");
    vColor = gl.getAttribLocation(program, "vColor");

    // 设置投影矩阵
    setupProjectionMatrix();

    // 设置事件监听器
    setupEventListeners();

    // 开始渲染循环
    render();
}

function setupProjectionMatrix() {
    var projectionMatrix = mat4.create();
    mat4.ortho(projectionMatrix, -1, 1, -1, 1, -10, 10);
    gl.uniformMatrix4fv(uProjectionMatrix, false, projectionMatrix);

    var viewMatrix = mat4.create();
    mat4.lookAt(viewMatrix, [0, 0, 5], [0, 0, 0], [0, 1, 0]);
    gl.uniformMatrix4fv(uViewMatrix, false, viewMatrix);
}

function setupEventListeners() {
    // 图形选择按钮
    var shapeButtons = document.querySelectorAll('.shape-button');
    shapeButtons.forEach(button => {
        button.addEventListener('click', function() {
            shapeButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            currentShapeType = this.dataset.shape;
            updateCurrentShapeDisplay();
        });
    });

    // 颜色选择器
    document.getElementById('colorPicker').addEventListener('input', function() {
        var hex = this.value;
        currentColor = hexToRgb(hex);
    });

    // 圆形边数控制
    document.getElementById('circleSides').addEventListener('input', function() {
        circleSides = parseInt(this.value);
        document.getElementById('sidesValue').textContent = circleSides;
    });

    // 图形大小控制
    document.getElementById('shapeSize').addEventListener('input', function() {
        shapeSize = parseFloat(this.value);
        document.getElementById('sizeValue').textContent = shapeSize.toFixed(2);
    });

    // 清空按钮
    document.getElementById('clearButton').addEventListener('click', function() {
        shapes = [];
        updateShapeCount();
    });

    // 信息按钮
    document.getElementById('infoButton').addEventListener('click', function() {
        alert(`场景信息:\n图形数量: ${shapes.length}\n当前图形: ${getShapeName(currentShapeType)}`);
    });

    // 画布点击事件
    canvas.addEventListener('click', function(event) {
        var rect = canvas.getBoundingClientRect();
        var x = ((event.clientX - rect.left) / canvas.width) * 2 - 1;
        var y = -(((event.clientY - rect.top) / canvas.height) * 2 - 1);
        
        addShape(x, y);
        updateClickPosition(x, y);
    });
}

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255,
        1.0
    ] : [1.0, 0.0, 0.0, 1.0];
}

function addShape(x, y) {
    var shape = {
        type: currentShapeType,
        position: [x, y, 0],
        color: [...currentColor],
        size: shapeSize,
        animationTime: 0,
        rotation: 0,
        scale: 1.0,
        randomOffset: [Math.random() * 0.1 - 0.05, Math.random() * 0.1 - 0.05]
    };
    
    shapes.push(shape);
    updateShapeCount();
}

function updateShapeCount() {
    document.getElementById('shapeCount').textContent = shapes.length;
}

function updateCurrentShapeDisplay() {
    document.getElementById('currentShape').textContent = getShapeName(currentShapeType);
}

function updateClickPosition(x, y) {
    document.getElementById('clickPosition').textContent = `(${x.toFixed(2)}, ${y.toFixed(2)})`;
}

function getShapeName(type) {
    var names = {
        'triangle': '正三角形',
        'square': '正方形', 
        'cube': '立方体',
        'circle': '圆形'
    };
    return names[type] || '未知图形';
}

function generateTriangleVertices(size) {
    var vertices = [];
    // 正三角形的边长等于size，高度为 size * √3 / 2
    var height = size * Math.sqrt(3) / 2;
    var halfSize = size / 2;
    
    // 正三角形的三个顶点
    vertices.push(0, height/2, 0);        // 顶点
    vertices.push(-halfSize, -height/2, 0); // 左下角
    vertices.push(halfSize, -height/2, 0);  // 右下角
    
    return vertices;
}

function generateSquareVertices(size) {
    var halfSize = size / 2;
    var vertices = [
        -halfSize, -halfSize, 0,
        halfSize, -halfSize, 0,
        halfSize, halfSize, 0,
        -halfSize, -halfSize, 0,
        halfSize, halfSize, 0,
        -halfSize, halfSize, 0
    ];
    return vertices;
}

function generateCircleVertices(size, sides) {
    var vertices = [];
    var angleStep = (2 * Math.PI) / sides;
    
    for (var i = 0; i < sides; i++) {
        var angle1 = i * angleStep;
        var angle2 = (i + 1) * angleStep;
        
        vertices.push(0, 0, 0);
        vertices.push(Math.cos(angle1) * size, Math.sin(angle1) * size, 0);
        vertices.push(Math.cos(angle2) * size, Math.sin(angle2) * size, 0);
    }
    
    return vertices;
}

function generateCubeVertices(size) {
    var halfSize = size / 2;
    var vertices = [];
    
    // 前面 (红色)
    vertices.push(-halfSize, -halfSize, halfSize);
    vertices.push(halfSize, -halfSize, halfSize);
    vertices.push(halfSize, halfSize, halfSize);
    vertices.push(-halfSize, -halfSize, halfSize);
    vertices.push(halfSize, halfSize, halfSize);
    vertices.push(-halfSize, halfSize, halfSize);
    
    // 后面 (绿色)
    vertices.push(-halfSize, -halfSize, -halfSize);
    vertices.push(-halfSize, halfSize, -halfSize);
    vertices.push(halfSize, halfSize, -halfSize);
    vertices.push(-halfSize, -halfSize, -halfSize);
    vertices.push(halfSize, halfSize, -halfSize);
    vertices.push(halfSize, -halfSize, -halfSize);
    
    // 上面 (蓝色)
    vertices.push(-halfSize, halfSize, -halfSize);
    vertices.push(-halfSize, halfSize, halfSize);
    vertices.push(halfSize, halfSize, halfSize);
    vertices.push(-halfSize, halfSize, -halfSize);
    vertices.push(halfSize, halfSize, halfSize);
    vertices.push(halfSize, halfSize, -halfSize);
    
    // 下面 (黄色)
    vertices.push(-halfSize, -halfSize, -halfSize);
    vertices.push(halfSize, -halfSize, -halfSize);
    vertices.push(halfSize, -halfSize, halfSize);
    vertices.push(-halfSize, -halfSize, -halfSize);
    vertices.push(halfSize, -halfSize, halfSize);
    vertices.push(-halfSize, -halfSize, halfSize);
    
    // 左面 (青色)
    vertices.push(-halfSize, -halfSize, -halfSize);
    vertices.push(-halfSize, -halfSize, halfSize);
    vertices.push(-halfSize, halfSize, halfSize);
    vertices.push(-halfSize, -halfSize, -halfSize);
    vertices.push(-halfSize, halfSize, halfSize);
    vertices.push(-halfSize, halfSize, -halfSize);
    
    // 右面 (品红色)
    vertices.push(halfSize, -halfSize, -halfSize);
    vertices.push(halfSize, halfSize, -halfSize);
    vertices.push(halfSize, halfSize, halfSize);
    vertices.push(halfSize, -halfSize, -halfSize);
    vertices.push(halfSize, halfSize, halfSize);
    vertices.push(halfSize, -halfSize, halfSize);
    
    return vertices;
}

function generateCubeColors() {
    var colors = [];
    
    // 前面 - 红色
    for (var i = 0; i < 6; i++) {
        colors.push(1.0, 0.0, 0.0, 1.0);
    }
    
    // 后面 - 绿色
    for (var i = 0; i < 6; i++) {
        colors.push(0.0, 1.0, 0.0, 1.0);
    }
    
    // 上面 - 蓝色
    for (var i = 0; i < 6; i++) {
        colors.push(0.0, 0.0, 1.0, 1.0);
    }
    
    // 下面 - 黄色
    for (var i = 0; i < 6; i++) {
        colors.push(1.0, 1.0, 0.0, 1.0);
    }
    
    // 左面 - 青色
    for (var i = 0; i < 6; i++) {
        colors.push(0.0, 1.0, 1.0, 1.0);
    }
    
    // 右面 - 品红色
    for (var i = 0; i < 6; i++) {
        colors.push(1.0, 0.0, 1.0, 1.0);
    }
    
    return colors;
}

function updateShapeAnimation(shape, deltaTime) {
    shape.animationTime += deltaTime;
    
    switch (shape.type) {
        case 'triangle':
            // 正三角形：持续放大缩小循环 (0.5-2之间)
            shape.scale = 0.5 + 1.5 * (0.5 + 0.5 * Math.sin(shape.animationTime * 2));
            break;
            
        case 'square':
            // 正方形：持续绕Z轴转动
            shape.rotation += deltaTime * 2;
            break;
            
        case 'cube':
            // 立方体：绕特定轴转动（确保能看到至少两个面）
            shape.rotation += deltaTime * 1.5;
            break;
            
        case 'circle':
            // 圆形：在XOY平面上作随机平移
            shape.position[0] += shape.randomOffset[0] * deltaTime * 0.5;
            shape.position[1] += shape.randomOffset[1] * deltaTime * 0.5;
            
            // 边界检查
            if (Math.abs(shape.position[0]) > 0.9) shape.randomOffset[0] *= -1;
            if (Math.abs(shape.position[1]) > 0.9) shape.randomOffset[1] *= -1;
            break;
    }
}

function renderShape(shape) {
    var vertices;
    var colors;
    
    // 根据图形类型生成顶点
    switch (shape.type) {
        case 'triangle':
            vertices = generateTriangleVertices(shape.size);
            break;
        case 'square':
            vertices = generateSquareVertices(shape.size);
            break;
        case 'circle':
            vertices = generateCircleVertices(shape.size, circleSides);
            break;
        case 'cube':
            vertices = generateCubeVertices(shape.size);
            // 立方体也使用用户选择的统一颜色
            break;
        default:
            return;
    }
    
    // 创建顶点缓冲区
    var vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    
    // 设置顶点属性
    gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);
    
    // 创建颜色缓冲区
    var colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    
    // 所有图形（包括立方体）都使用用户选择的统一颜色
    var singleColor = [];
    for (var i = 0; i < vertices.length / 3; i++) {
        singleColor.push(...shape.color);
    }
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(singleColor), gl.STATIC_DRAW);
    
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColor);
    
    // 计算模型矩阵
    var modelMatrix = mat4.create();
    mat4.translate(modelMatrix, modelMatrix, shape.position);
    
    if (shape.type === 'cube') {
        // 立方体使用更复杂的旋转以确保能看到多个面
        mat4.rotateX(modelMatrix, modelMatrix, shape.rotation * 0.7);
        mat4.rotateY(modelMatrix, modelMatrix, shape.rotation * 1.2);
        mat4.rotateZ(modelMatrix, modelMatrix, shape.rotation * 0.5);
    } else {
        mat4.rotateZ(modelMatrix, modelMatrix, shape.rotation);
    }
    
    mat4.scale(modelMatrix, modelMatrix, [shape.scale, shape.scale, shape.scale]);
    
    gl.uniformMatrix4fv(uModelMatrix, false, modelMatrix);
    
    // 绘制图形
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 3);
    
    // 清理缓冲区
    gl.deleteBuffer(vertexBuffer);
    gl.deleteBuffer(colorBuffer);
}

var lastTime = 0;
function render(currentTime = 0) {
    var deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    // 更新和渲染所有图形
    shapes.forEach(shape => {
        updateShapeAnimation(shape, deltaTime);
        renderShape(shape);
    });
    
    requestAnimationFrame(render);
}

// 页面加载完成后初始化场景
window.addEventListener('load', function() {
    initScene();
    updateCurrentShapeDisplay();
    updateShapeCount();
});

// 显示圆形边数控制（仅当选择圆形时）
function toggleCircleControls(show) {
    var circleControl = document.getElementById('circleSidesControl');
    circleControl.style.display = show ? 'block' : 'none';
}

// 更新图形选择时显示/隐藏圆形控制
document.querySelectorAll('.shape-button').forEach(button => {
    button.addEventListener('click', function() {
        toggleCircleControls(this.dataset.shape === 'circle');
    });
});