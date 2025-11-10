"use strict";

// 使用glMatrix库
const {vec3, vec4, mat3, mat4} = glMatrix;

/**
 * WebGL渲染器类 - 实现实验6和实验7的所有功能
 */
function Lab67Renderer(canvasName) {
    // WebGL上下文和画布
    this.canvas = null;
    this.gl = null;
    
    // 着色器程序
    this.program = null;
    
    // 缓冲区
    this.vertexBuffer = null;
    this.normalBuffer = null;
    this.indexBuffer = null;
    
    // 模型数据
    this.vertices = [];
    this.normals = [];
    this.indices = [];
    this.vertexCount = 0;
    
    // 模型加载器
    this.modelLoader = null;
    this.currentModel = null;
    
    // 变换矩阵
    this.modelMatrix = mat4.create();
    this.viewMatrix = mat4.create();
    this.projectionMatrix = mat4.create();
    this.modelViewMatrix = mat4.create();
    this.normalMatrix = mat3.create();
    
    // 模型变换参数
    this.modelTranslation = vec3.fromValues(0, 0, 0);
    this.modelRotation = vec3.fromValues(0, 0, 0);
    this.modelScale = vec3.fromValues(1, 1, 1);
    
    // 相机参数
    this.cameraPosition = vec3.fromValues(5, 5, 5);
    this.cameraRotation = vec3.fromValues(0, 0, 0);
    this.cameraTarget = vec3.fromValues(0, 0, 0);
    this.cameraUp = vec3.fromValues(0, 1, 0);
    
    // 投影参数
    this.projectionMode = 'perspective'; // 'perspective' 或 'orthographic'
    this.fov = 45;
    this.aspect = 1;
    this.near = 0.1;
    this.far = 100;
    this.orthoLeft = -5;
    this.orthoRight = 5;
    this.orthoBottom = -5;
    this.orthoTop = 5;
    
    // 光照参数
    this.lightPosition = vec4.fromValues(5, 5, 5, 0);
    this.lightColor = vec4.fromValues(1, 1, 1, 1);
    
    // 材质参数
    this.materialAmbient = vec4.fromValues(0.2, 0.2, 0.2, 1);
    this.materialDiffuse = vec4.fromValues(0.8, 0.8, 0.8, 1);
    this.materialSpecular = vec4.fromValues(0.5, 0.5, 0.5, 1);
    this.materialShininess = 32;
    
    // 渲染模式
    this.renderMode = 'solid'; // 'solid' 或 'wireframe'
    this.wireframeColor = vec4.fromValues(1, 1, 1, 1);
    this.shadingMode = 'phong'; // 'phong' 或 'gouraud'
    
    // 着色器变量位置
    this.attribLocations = {};
    this.uniformLocations = {};
    
    // 键盘控制状态
    this.keys = {};
    
    // 顶点着色器源码 - Phong着色
    this.vertSrcPhong = `#version 300 es
        in vec4 aPosition;
        in vec3 aNormal;
        
        uniform mat4 uModelMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uProjectionMatrix;
        uniform mat3 uNormalMatrix;
        uniform vec4 uLightPosition;
        
        out vec3 vNormal;
        out vec3 vLightDir;
        out vec3 vViewDir;
        out vec4 vPosition;
        
        void main() {
            vPosition = uViewMatrix * uModelMatrix * aPosition;
            vNormal = normalize(uNormalMatrix * aNormal);
            
            if (uLightPosition.w == 0.0) {
                vLightDir = normalize(uLightPosition.xyz);
            } else {
                vLightDir = normalize(uLightPosition.xyz - vPosition.xyz);
            }
            
            vViewDir = normalize(-vPosition.xyz);
            gl_Position = uProjectionMatrix * vPosition;
        }
    `;
    
    // 片段着色器源码 - Phong着色
    this.fragSrcPhong = `#version 300 es
        precision mediump float;
        
        in vec3 vNormal;
        in vec3 vLightDir;
        in vec3 vViewDir;
        in vec4 vPosition;
        
        uniform vec4 uLightColor;
        uniform vec4 uMaterialAmbient;
        uniform vec4 uMaterialDiffuse;
        uniform vec4 uMaterialSpecular;
        uniform float uMaterialShininess;
        uniform vec4 uWireframeColor;
        uniform bool uWireframeMode;
        
        out vec4 fragColor;
        
        void main() {
            if (uWireframeMode) {
                fragColor = uWireframeColor;
                return;
            }
            
            vec3 normal = normalize(vNormal);
            vec3 lightDir = normalize(vLightDir);
            vec3 viewDir = normalize(vViewDir);
            
            // 环境光
            vec4 ambient = uMaterialAmbient * uLightColor;
            
            // 漫反射
            float diff = max(dot(normal, lightDir), 0.0);
            vec4 diffuse = diff * uMaterialDiffuse * uLightColor;
            
            // 镜面反射
            vec3 reflectDir = reflect(-lightDir, normal);
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), uMaterialShininess);
            vec4 specular = spec * uMaterialSpecular * uLightColor;
            
            fragColor = ambient + diffuse + specular;
            fragColor.a = 1.0;
        }
    `;
    
    // 顶点着色器源码 - Gouraud着色
    this.vertSrcGouraud = `#version 300 es
        in vec4 aPosition;
        in vec3 aNormal;
        
        uniform mat4 uModelMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uProjectionMatrix;
        uniform mat3 uNormalMatrix;
        uniform vec4 uLightPosition;
        uniform vec4 uLightColor;
        uniform vec4 uMaterialAmbient;
        uniform vec4 uMaterialDiffuse;
        uniform vec4 uMaterialSpecular;
        uniform float uMaterialShininess;
        
        out vec4 vColor;
        
        void main() {
            vec4 position = uViewMatrix * uModelMatrix * aPosition;
            vec3 normal = normalize(uNormalMatrix * aNormal);
            
            vec3 lightDir;
            if (uLightPosition.w == 0.0) {
                lightDir = normalize(uLightPosition.xyz);
            } else {
                lightDir = normalize(uLightPosition.xyz - position.xyz);
            }
            
            vec3 viewDir = normalize(-position.xyz);
            
            // 环境光
            vec4 ambient = uMaterialAmbient * uLightColor;
            
            // 漫反射
            float diff = max(dot(normal, lightDir), 0.0);
            vec4 diffuse = diff * uMaterialDiffuse * uLightColor;
            
            // 镜面反射
            vec3 reflectDir = reflect(-lightDir, normal);
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), uMaterialShininess);
            vec4 specular = spec * uMaterialSpecular * uLightColor;
            
            vColor = ambient + diffuse + specular;
            vColor.a = 1.0;
            
            gl_Position = uProjectionMatrix * position;
        }
    `;
    
    // 片段着色器源码 - Gouraud着色
    this.fragSrcGouraud = `#version 300 es
        precision mediump float;
        
        in vec4 vColor;
        uniform vec4 uWireframeColor;
        uniform bool uWireframeMode;
        
        out vec4 fragColor;
        
        void main() {
            if (uWireframeMode) {
                fragColor = uWireframeColor;
            } else {
                fragColor = vColor;
            }
        }
    `;
}

/**
 * 初始化WebGL渲染器
 */
Lab67Renderer.prototype.init = function() {
    // 获取画布和WebGL上下文
    this.canvas = document.getElementById(this.canvasName || "gl-canvas");
    try {
        this.gl = this.canvas.getContext("webgl2");
        if (!this.gl) {
            throw new Error("WebGL 2.0 not supported");
        }
    } catch (e) {
        alert("错误: " + e.message);
        return;
    }
    
    // 设置视口和清除颜色
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.CULL_FACE);
    
    // 初始化着色器
    this.initShaders();
    
    // 初始化缓冲区
    this.initBuffers();
    
    // 设置初始变换矩阵
    this.updateMatrices();
    
    // 设置键盘事件监听
    this.setupEventListeners();
    
    // 初始化模型加载器
    this.initModelLoader();
    
    // 创建默认模型
    this.createDefaultModel();
};

/**
 * 初始化着色器程序
 */
Lab67Renderer.prototype.initShaders = function() {
    const gl = this.gl;
    
    // 根据着色模式选择着色器源码
    let vertSrc, fragSrc;
    if (this.shadingMode === 'gouraud') {
        vertSrc = this.vertSrcGouraud;
        fragSrc = this.fragSrcGouraud;
    } else {
        vertSrc = this.vertSrcPhong;
        fragSrc = this.fragSrcPhong;
    }
    
    // 编译着色器
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertSrc);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);
    
    // 创建着色器程序
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);
    
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        alert("无法初始化着色器程序: " + gl.getProgramInfoLog(this.program));
        return;
    }
    
    gl.useProgram(this.program);
    
    // 获取属性位置
    this.attribLocations = {
        position: gl.getAttribLocation(this.program, "aPosition"),
        normal: gl.getAttribLocation(this.program, "aNormal")
    };
    
    // 获取统一变量位置
    this.uniformLocations = {
        modelMatrix: gl.getUniformLocation(this.program, "uModelMatrix"),
        viewMatrix: gl.getUniformLocation(this.program, "uViewMatrix"),
        projectionMatrix: gl.getUniformLocation(this.program, "uProjectionMatrix"),
        normalMatrix: gl.getUniformLocation(this.program, "uNormalMatrix"),
        lightPosition: gl.getUniformLocation(this.program, "uLightPosition"),
        lightColor: gl.getUniformLocation(this.program, "uLightColor"),
        materialAmbient: gl.getUniformLocation(this.program, "uMaterialAmbient"),
        materialDiffuse: gl.getUniformLocation(this.program, "uMaterialDiffuse"),
        materialSpecular: gl.getUniformLocation(this.program, "uMaterialSpecular"),
        materialShininess: gl.getUniformLocation(this.program, "uMaterialShininess"),
        wireframeColor: gl.getUniformLocation(this.program, "uWireframeColor"),
        wireframeMode: gl.getUniformLocation(this.program, "uWireframeMode")
    };
};

/**
 * 编译着色器
 */
Lab67Renderer.prototype.compileShader = function(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert("着色器编译错误: " + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    
    return shader;
};

/**
 * 初始化模型加载器
 */
Lab67Renderer.prototype.initModelLoader = function() {
    this.modelLoader = new ModelLoader();
};

/**
 * 初始化缓冲区
 */
Lab67Renderer.prototype.initBuffers = function() {
    const gl = this.gl;
    
    // 创建顶点缓冲区
    this.vertexBuffer = gl.createBuffer();
    this.normalBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();
    this.wireframeIndexBuffer = gl.createBuffer();
    this.wireframeIndexCount = 0;
};

/**
 * 创建默认模型（立方体）
 */
Lab67Renderer.prototype.createDefaultModel = function() {
    // 创建立方体顶点数据
    const vertices = [
        // 前面
        -1, -1,  1, 1,   1, -1,  1, 1,   1,  1,  1, 1,   -1,  1,  1, 1,
        // 后面
        -1, -1, -1, 1,   -1,  1, -1, 1,   1,  1, -1, 1,    1, -1, -1, 1,
        // 上面
        -1,  1, -1, 1,   -1,  1,  1, 1,   1,  1,  1, 1,    1,  1, -1, 1,
        // 下面
        -1, -1, -1, 1,    1, -1, -1, 1,   1, -1,  1, 1,   -1, -1,  1, 1,
        // 右面
         1, -1, -1, 1,    1,  1, -1, 1,   1,  1,  1, 1,    1, -1,  1, 1,
        // 左面
        -1, -1, -1, 1,   -1, -1,  1, 1,   -1,  1,  1, 1,   -1,  1, -1, 1
    ];
    
    const normals = [
        // 前面
        0, 0, 1,   0, 0, 1,   0, 0, 1,   0, 0, 1,
        // 后面
        0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
        // 上面
        0, 1, 0,   0, 1, 0,   0, 1, 0,   0, 1, 0,
        // 下面
        0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
        // 右面
        1, 0, 0,   1, 0, 0,   1, 0, 0,   1, 0, 0,
        // 左面
        -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0
    ];
    
    const indices = [
        0, 1, 2,   0, 2, 3,     // 前面
        4, 5, 6,   4, 6, 7,     // 后面
        8, 9, 10,  8, 10, 11,   // 上面
        12, 13, 14, 12, 14, 15,  // 下面
        16, 17, 18, 16, 18, 19,  // 右面
        20, 21, 22, 20, 22, 23   // 左面
    ];
    
    this.vertices = vertices;
    this.normals = normals;
    this.indices = indices;
    this.vertexCount = indices.length;
    
    this.updateBuffers();
};

/**
 * 更新缓冲区数据
 */
Lab67Renderer.prototype.updateBuffers = function() {
    const gl = this.gl;
    
    // 绑定顶点数据
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);
    
    // 绑定法线数据
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.normals), gl.STATIC_DRAW);
    
    // 绑定索引数据
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.indices), gl.STATIC_DRAW);

    const edgeSet = new Set();
    const edges = [];
    const pushEdge = (a, b) => {
        const min = a < b ? a : b;
        const max = a < b ? b : a;
        const key = min + '-' + max;
        if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push(min, max);
        }
    };
    for (let i = 0; i < this.indices.length; i += 3) {
        const i0 = this.indices[i];
        const i1 = this.indices[i + 1];
        const i2 = this.indices[i + 2];
        pushEdge(i0, i1);
        pushEdge(i1, i2);
        pushEdge(i2, i0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireframeIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(edges), gl.STATIC_DRAW);
    this.wireframeIndexCount = edges.length;
};

/**
 * 更新变换矩阵
 */
Lab67Renderer.prototype.updateMatrices = function() {
    const gl = this.gl;
    
    // 重置矩阵
    mat4.identity(this.modelMatrix);
    mat4.identity(this.viewMatrix);
    mat4.identity(this.projectionMatrix);
    
    // 应用模型变换
    mat4.translate(this.modelMatrix, this.modelMatrix, this.modelTranslation);
    mat4.rotateX(this.modelMatrix, this.modelMatrix, this.modelRotation[0] * Math.PI / 180);
    mat4.rotateY(this.modelMatrix, this.modelMatrix, this.modelRotation[1] * Math.PI / 180);
    mat4.rotateZ(this.modelMatrix, this.modelMatrix, this.modelRotation[2] * Math.PI / 180);
    mat4.scale(this.modelMatrix, this.modelMatrix, this.modelScale);
    
    // 应用视图变换
    const eye = this.cameraPosition;
    const target = this.cameraTarget;
    const up = this.cameraUp;
    mat4.lookAt(this.viewMatrix, eye, target, up);
    
    // 应用视图旋转
    mat4.rotateX(this.viewMatrix, this.viewMatrix, this.cameraRotation[0] * Math.PI / 180);
    mat4.rotateY(this.viewMatrix, this.viewMatrix, this.cameraRotation[1] * Math.PI / 180);
    
    // 应用投影变换
    this.aspect = this.canvas.width / this.canvas.height;
    
    if (this.projectionMode === 'orthographic') {
        mat4.ortho(this.projectionMatrix, 
            this.orthoLeft, this.orthoRight, 
            this.orthoBottom, this.orthoTop, 
            this.near, this.far);
    } else {
        mat4.perspective(this.projectionMatrix, 
            this.fov * Math.PI / 180, this.aspect, 
            this.near, this.far);
    }
    
    // 计算模型视图矩阵和法线矩阵
    mat4.multiply(this.modelViewMatrix, this.viewMatrix, this.modelMatrix);
    mat3.normalFromMat4(this.normalMatrix, this.modelViewMatrix);
    
    // 更新着色器统一变量
    this.updateShaderUniforms();
};

/**
 * 更新着色器统一变量
 */
Lab67Renderer.prototype.updateShaderUniforms = function() {
    const gl = this.gl;
    
    gl.uniformMatrix4fv(this.uniformLocations.modelMatrix, false, this.modelMatrix);
    gl.uniformMatrix4fv(this.uniformLocations.viewMatrix, false, this.viewMatrix);
    gl.uniformMatrix4fv(this.uniformLocations.projectionMatrix, false, this.projectionMatrix);
    gl.uniformMatrix3fv(this.uniformLocations.normalMatrix, false, this.normalMatrix);
    
    gl.uniform4fv(this.uniformLocations.lightPosition, this.lightPosition);
    gl.uniform4fv(this.uniformLocations.lightColor, this.lightColor);
    
    gl.uniform4fv(this.uniformLocations.materialAmbient, this.materialAmbient);
    gl.uniform4fv(this.uniformLocations.materialDiffuse, this.materialDiffuse);
    gl.uniform4fv(this.uniformLocations.materialSpecular, this.materialSpecular);
    gl.uniform1f(this.uniformLocations.materialShininess, this.materialShininess);
    
    gl.uniform4fv(this.uniformLocations.wireframeColor, this.wireframeColor);
    gl.uniform1i(this.uniformLocations.wireframeMode, this.renderMode === 'wireframe');
};

/**
 * 渲染场景
 */
Lab67Renderer.prototype.display = function() {
    const gl = this.gl;
    
    // 清除画布
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    // 使用着色器程序
    gl.useProgram(this.program);
    
    // 更新矩阵
    this.updateMatrices();
    
    // 如果当前有加载的模型，使用模型加载器渲染
    if (this.currentModel && this.modelLoader && this.modelLoader.loaded) {
        this.renderLoadedModel();
    } else {
        // 否则使用默认模型
        this.renderDefaultModel();
    }
};

/**
 * 渲染加载的模型
 */
Lab67Renderer.prototype.renderLoadedModel = function() {
    const gl = this.gl;
    
    // 使用模型加载器渲染当前模型，传入属性位置
    this.modelLoader.render(gl, this.attribLocations, this.currentModel, this.renderMode === 'wireframe');
};

/**
 * 渲染默认模型
 */
Lab67Renderer.prototype.renderDefaultModel = function() {
    const gl = this.gl;
    
    // 设置顶点属性
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.vertexAttribPointer(this.attribLocations.position, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.attribLocations.position);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.vertexAttribPointer(this.attribLocations.normal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.attribLocations.normal);
    
    // 绘制模型
    if (this.renderMode === 'wireframe') {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireframeIndexBuffer);
        gl.drawElements(gl.LINES, this.wireframeIndexCount, gl.UNSIGNED_SHORT, 0);
    } else {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.drawElements(gl.TRIANGLES, this.vertexCount, gl.UNSIGNED_SHORT, 0);
    }
};

/**
 * 设置事件监听器
 */
Lab67Renderer.prototype.setupEventListeners = function() {
    const self = this;
    
    document.addEventListener('keydown', function(event) {
        self.keys[event.key] = true;
        self.handleKeyboardInput();
    });
    
    document.addEventListener('keyup', function(event) {
        self.keys[event.key] = false;
    });
    
    // 窗口大小变化时更新视口
    window.addEventListener('resize', function() {
        self.canvas.width = self.canvas.clientWidth;
        self.canvas.height = self.canvas.clientHeight;
        self.gl.viewport(0, 0, self.canvas.width, self.canvas.height);
        self.display();
    });
};

/**
 * 处理键盘输入
 */
Lab67Renderer.prototype.handleKeyboardInput = function() {
    const step = 0.1;
    const rotationStep = 2;
    
    // 模型旋转
    if (this.keys['w'] || this.keys['W']) this.modelRotation[0] += rotationStep;
    if (this.keys['s'] || this.keys['S']) this.modelRotation[0] -= rotationStep;
    if (this.keys['a'] || this.keys['A']) this.modelRotation[1] += rotationStep;
    if (this.keys['d'] || this.keys['D']) this.modelRotation[1] -= rotationStep;
    if (this.keys['q'] || this.keys['Q']) this.modelRotation[2] += rotationStep;
    if (this.keys['e'] || this.keys['E']) this.modelRotation[2] -= rotationStep;
    
    // 模型平移
    if (this.keys['ArrowUp']) this.modelTranslation[1] += step;
    if (this.keys['ArrowDown']) this.modelTranslation[1] -= step;
    if (this.keys['ArrowLeft']) this.modelTranslation[0] -= step;
    if (this.keys['ArrowRight']) this.modelTranslation[0] += step;
    if (this.keys['PageUp']) this.modelTranslation[2] += step;
    if (this.keys['PageDown']) this.modelTranslation[2] -= step;
    
    // 模型缩放
    if (this.keys['+']) {
        this.modelScale[0] += step;
        this.modelScale[1] += step;
        this.modelScale[2] += step;
    }
    if (this.keys['-']) {
        this.modelScale[0] = Math.max(0.1, this.modelScale[0] - step);
        this.modelScale[1] = Math.max(0.1, this.modelScale[1] - step);
        this.modelScale[2] = Math.max(0.1, this.modelScale[2] - step);
    }
    
    // 相机控制
    if (this.keys['i'] || this.keys['I']) this.cameraRotation[0] += rotationStep;
    if (this.keys['k'] || this.keys['K']) this.cameraRotation[0] -= rotationStep;
    if (this.keys['j'] || this.keys['J']) this.cameraRotation[1] += rotationStep;
    if (this.keys['l'] || this.keys['L']) this.cameraRotation[1] -= rotationStep;
    if (this.keys['u'] || this.keys['U']) this.cameraPosition[2] += step;
    if (this.keys['o'] || this.keys['O']) this.cameraPosition[2] -= step;
    
    this.display();
};

// ========== 公共接口方法 ==========

/**
 * 加载猫模型
 */
Lab67Renderer.prototype.loadCatModel = function() {
    const self = this;
    
    // 猫模型文件路径
    const modelPath = "obj/12221_Cat_v1_l3.obj";
    
    // 显示加载提示
    console.log("开始加载猫模型...");
    
    // 使用模型加载器加载模型
    this.modelLoader.loadCatModel(modelPath)
        .then(function(mesh) {
            console.log("猫模型加载成功");
            
            // 初始化WebGL缓冲区
            self.modelLoader.initBuffers(self.gl, 'cat');
            
            // 设置当前模型
            self.currentModel = 'cat';
            
            // 自动调整模型大小和位置
            self.autoAdjustModel();
            
            // 重新渲染
            self.display();
            
            // 更新UI状态
            if (typeof updateModelStatus === 'function') {
                updateModelStatus('猫模型已加载');
            }
        })
        .catch(function(error) {
            console.error("猫模型加载失败:", error);
            alert("猫模型加载失败，请检查模型文件路径: " + modelPath);
            
            // 使用默认模型
            self.createDefaultModel();
            self.display();
        });
};

/**
 * 自动调整模型大小和位置
 */
Lab67Renderer.prototype.autoAdjustModel = function() {
    if (!this.currentModel || !this.modelLoader || !this.modelLoader.meshes[this.currentModel]) {
        console.warn('无法自动调整模型: 没有加载的模型');
        return;
    }
    
    try {
        // 获取模型边界框
        const boundingBox = this.modelLoader.getBoundingBox(this.currentModel);
        if (!boundingBox) {
            console.warn('无法获取模型边界框');
            return;
        }
        
        // 计算模型中心
        const center = this.modelLoader.getCenter(this.currentModel);
        
        // 计算模型大小
        const size = {
            x: boundingBox.width,
            y: boundingBox.height,
            z: boundingBox.depth
        };
        
        // 计算缩放因子，使模型适配到视图空间
        const maxDimension = Math.max(size.x, size.y, size.z);
        const scaleFactor = 2.0 / maxDimension; // 调整此值以改变默认大小
        
        // 设置模型变换
        this.modelTranslation = vec3.fromValues(-center[0] * scaleFactor, -center[1] * scaleFactor, -center[2] * scaleFactor - 3.0);
        this.modelScale = vec3.fromValues(scaleFactor, scaleFactor, scaleFactor);
        
        // 设置相机位置，使其能够看到整个模型
        const cameraDistance = maxDimension * 2;
        this.cameraPosition = vec3.fromValues(cameraDistance, cameraDistance, cameraDistance);
        
        // 更新UI元素（如果存在）
        if (document.getElementById('translate-x')) {
            document.getElementById('translate-x').value = this.modelTranslation[0];
            document.getElementById('translate-y').value = this.modelTranslation[1];
            document.getElementById('translate-z').value = this.modelTranslation[2];
            document.getElementById('scale').value = scaleFactor;
            
            // 更新显示值
            document.getElementById('translate-x-value').textContent = this.modelTranslation[0].toFixed(2);
            document.getElementById('translate-y-value').textContent = this.modelTranslation[1].toFixed(2);
            document.getElementById('translate-z-value').textContent = this.modelTranslation[2].toFixed(2);
            document.getElementById('scale-value').textContent = scaleFactor.toFixed(2);
        }
        
        console.log('模型已自动调整:', {
            center: center,
            size: size,
            scaleFactor: scaleFactor,
            cameraDistance: cameraDistance
        });
    } catch (error) {
        console.error('自动调整模型时出错:', error);
    }
};

/**
 * 加载默认模型
 */
Lab67Renderer.prototype.loadDefaultModel = function() {
    // 清除当前加载的模型
    this.currentModel = null;
    if (this.modelLoader) {
        this.modelLoader.loaded = false;
    }
    
    this.createDefaultModel();
    this.display();
};

/**
 * 设置渲染模式
 */
Lab67Renderer.prototype.setRenderMode = function(mode) {
    this.renderMode = mode;
    this.display();
};

/**
 * 设置线框颜色
 */
Lab67Renderer.prototype.setWireframeColor = function(color) {
    const r = parseInt(color.substr(1, 2), 16) / 255;
    const g = parseInt(color.substr(3, 2), 16) / 255;
    const b = parseInt(color.substr(5, 2), 16) / 255;
    this.wireframeColor = vec4.fromValues(r, g, b, 1);
    this.display();
};

/**
 * 设置模型变换
 */
Lab67Renderer.prototype.setModelTransform = function(tx, ty, tz, rx, ry, rz, scale) {
    this.modelTranslation = vec3.fromValues(tx, ty, tz);
    this.modelRotation = vec3.fromValues(rx, ry, rz);
    this.modelScale = vec3.fromValues(scale, scale, scale);
    this.display();
};

/**
 * 重置模型变换
 */
Lab67Renderer.prototype.resetModelTransform = function() {
    this.modelTranslation = vec3.fromValues(0, 0, 0);
    this.modelRotation = vec3.fromValues(0, 0, 0);
    this.modelScale = vec3.fromValues(1, 1, 1);
    this.display();
};

/**
 * 设置投影模式
 */
Lab67Renderer.prototype.setProjectionMode = function(mode) {
    this.projectionMode = mode;
    this.display();
};

/**
 * 设置相机变换
 */
Lab67Renderer.prototype.setCameraTransform = function(x, y, z, rx, ry) {
    this.cameraPosition = vec3.fromValues(x, y, z);
    this.cameraRotation = vec3.fromValues(rx, ry, 0);
    this.display();
};

/**
 * 重置相机变换
 */
Lab67Renderer.prototype.resetCameraTransform = function() {
    this.cameraPosition = vec3.fromValues(5, 5, 5);
    this.cameraRotation = vec3.fromValues(0, 0, 0);
    this.display();
};

/**
 * 设置投影参数
 */
Lab67Renderer.prototype.setProjectionParams = function(fov, near, far) {
    this.fov = fov;
    this.near = near;
    this.far = far;
    this.display();
};

/**
 * 设置光源位置
 */
Lab67Renderer.prototype.setLightPosition = function(x, y, z) {
    this.lightPosition = vec4.fromValues(x, y, z, 0);
    this.display();
};

/**
 * 设置光源颜色
 */
Lab67Renderer.prototype.setLightColor = function(color) {
    const r = parseInt(color.substr(1, 2), 16) / 255;
    const g = parseInt(color.substr(3, 2), 16) / 255;
    const b = parseInt(color.substr(5, 2), 16) / 255;
    this.lightColor = vec4.fromValues(r, g, b, 1);
    this.display();
};

/**
 * 设置材质属性
 */
Lab67Renderer.prototype.setMaterialProperties = function(ambient, diffuse, specular, shininess, color) {
    this.materialAmbient = vec4.fromValues(ambient, ambient, ambient, 1);
    this.materialDiffuse = vec4.fromValues(diffuse, diffuse, diffuse, 1);
    this.materialSpecular = vec4.fromValues(specular, specular, specular, 1);
    this.materialShininess = shininess;
    
    if (color) {
        const r = parseInt(color.substr(1, 2), 16) / 255;
        const g = parseInt(color.substr(3, 2), 16) / 255;
        const b = parseInt(color.substr(5, 2), 16) / 255;
        this.materialDiffuse = vec4.fromValues(r * diffuse, g * diffuse, b * diffuse, 1);
    }
    
    this.display();
};

/**
 * 设置着色模式
 */
Lab67Renderer.prototype.setShadingMode = function(mode) {
    this.shadingMode = mode;
    this.initShaders(); // 重新初始化着色器
    this.display();
};