"use strict";

const { vec3, mat3, mat4 } = glMatrix;

var gl;
var canvas;
var program;

var mvMatrix = mat4.create();
var pMatrix = mat4.create();
var normalMatrix = mat3.create();

var model = {
    mesh: null,
    wireIndexBuffer: null,
    color: vec3.fromValues(0.25, 0.55, 1.0),
    alpha: 0.9,
    renderMode: "solid", // solid|wire
};

// object transform
var tx = 0.0, ty = 0.0, tz = 0.0;
var rx = 0.0, ry = 0.0, rz = 0.0;
var scaleVal = 1.0;
// 模型初始居中偏移（世界坐标），与用户平移叠加
var modelCenterX = 0.0, modelCenterY = 0.0, modelCenterZ = 0.0;

// camera
var eye = vec3.fromValues(0.0, 0.0, 4.0);
var at = vec3.fromValues(0.0, 0.0, 0.0);
var up = vec3.fromValues(0.0, 1.0, 0.0);

// 摄像机参数（绕自身坐标轴旋转）
var camPosition = vec3.fromValues(0.0, 0.0, 5.0); // 相机位置
var camBasePosition = vec3.fromValues(0.0, 0.0, 5.0); // 相机基础位置（用于平移计算）
var camForward = vec3.fromValues(0.0, 0.0, -1.0); // 相机前向
var camUp = vec3.fromValues(0.0, 1.0, 0.0);      // 相机上方向
var camRight = vec3.fromValues(1.0, 0.0, 0.0);    // 相机右方向
var camPitch = 0.0; // 绕自身X轴旋转（俯仰）
var camYaw = 0.0;   // 绕自身Y轴旋转（偏航）
var camRoll = 0.0;  // 绕自身Z轴旋转（滚转）

// 投影参数
var projectionMode = 'persp'; // 'persp' | 'ortho'
var fovy = 45.0 * Math.PI / 180.0;
var near = 0.1;
var far = 100.0;
var orthoLeft = -1.0, orthoRight = 1.0, orthoBottom = -1.0, orthoTop = 1.0;

function initApp(){
    canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext("webgl2");
    if(!gl){ alert("WebGL2 不可用"); return; }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.enable(gl.DEPTH_TEST);

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // 默认加载一个简单立方体（如果未选择文件）
    setupUI();

    requestAnimFrame(render);
}

function setupUI(){
    // 文件加载 OBJ
    document.getElementById("fileInput").addEventListener("change", function(){
        let file = this.files[0];
        if(!file) return;
        if(typeof OBJ === 'undefined'){
            alert('OBJ 解析库未加载');
            console.error('OBJ parser library not found');
            return;
        }
        let reader = new FileReader();
        reader.onload = function(){
            try{
                let mesh = new OBJ.Mesh(reader.result);
                if(!mesh.vertices || mesh.vertices.length === 0){
                    alert("OBJ 文件解析失败：未找到顶点数据");
                    console.error("OBJ parse produced empty mesh");
                    return;
                }
                OBJ.initMeshBuffers(gl, mesh);
                buildWireIndices(mesh);
                model.mesh = mesh;
                computeBoundsAndAdapt(mesh);
                console.log("OBJ 已加载：", file.name, mesh.vertices.length/3, "个顶点");
            }catch(e){
                alert("OBJ 文件加载/解析异常：" + e);
                console.error("OBJ parse error", e);
            }
        };
        reader.readAsText(file);
    });

    // 渲染模式
    document.querySelectorAll('input[name="renderMode"]').forEach(function(el){
        el.addEventListener("change", function(){
            model.renderMode = this.value;
        });
    });

    document.getElementById("chkBlend").addEventListener("change", function(){
        if(this.checked){
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }else{
            gl.disable(gl.BLEND);
        }
    });
    // 默认启用混合
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 变换滑块（加入远裁剪约束）
    document.getElementById("tx").oninput = function(){ tx = parseFloat(this.value); clampModelWithinFar(); };
    document.getElementById("ty").oninput = function(){ ty = parseFloat(this.value); clampModelWithinFar(); };
    document.getElementById("tz").oninput = function(){ tz = parseFloat(this.value); clampModelWithinFar(); };

    document.getElementById("rx").oninput = function(){ rx = parseFloat(this.value) * Math.PI/180.0; };
    document.getElementById("ry").oninput = function(){ ry = parseFloat(this.value) * Math.PI/180.0; };
    document.getElementById("rz").oninput = function(){ rz = parseFloat(this.value) * Math.PI/180.0; };

    document.getElementById("scale").oninput = function(){ scaleVal = parseFloat(this.value); };

    document.getElementById("alpha").oninput = function(){ model.alpha = parseFloat(this.value); };

    document.getElementById("color").addEventListener("input", function(){
        let hex = this.value.replace('#','');
        model.color = vec3.fromValues(parseInt(hex.substr(0,2),16)/255.0,
                                      parseInt(hex.substr(2,2),16)/255.0,
                                      parseInt(hex.substr(4,2),16)/255.0);
    });

    document.getElementById("btnReset").onclick = function(){
        tx = ty = tz = 0.0;
        rx = ry = rz = 0.0;
        scaleVal = 1.0;
        document.getElementById("tx").value = 0;
        document.getElementById("ty").value = 0;
        document.getElementById("tz").value = 0;
        document.getElementById("rx").value = 0;
        document.getElementById("ry").value = 0;
        document.getElementById("rz").value = 0;
        document.getElementById("scale").value = 1;
        document.getElementById("alpha").value = model.alpha;
    };

    // 摄像机滑块
    document.getElementById('camRadius').oninput = function(){ 
        // 修改为控制相机与目标的距离，但保留平移偏移
        let distance = parseFloat(this.value);
        // 计算当前平移偏移
        let tx = parseFloat(document.getElementById('camTx').value || '0');
        let ty = parseFloat(document.getElementById('camTy').value || '0');
        let tz = parseFloat(document.getElementById('camTz').value || '0');
        
        // 设置基础位置为沿前向的距离
        vec3.copy(camBasePosition, camForward);
        vec3.normalize(camBasePosition, camBasePosition);
        vec3.scale(camBasePosition, camBasePosition, -distance);
        
        // 应用平移偏移
        vec3.copy(camPosition, camBasePosition);
        vec3.scaleAndAdd(camPosition, camPosition, camRight, tx);
        vec3.scaleAndAdd(camPosition, camPosition, camUp, ty);
        vec3.scaleAndAdd(camPosition, camPosition, camForward, tz);
    };
    document.getElementById('camTheta').oninput = function(){ 
        camPitch = parseFloat(this.value) * Math.PI/180.0; 
        updateCameraOrientation();
    };
    document.getElementById('camPhi').oninput = function(){ 
        camYaw = parseFloat(this.value) * Math.PI/180.0; 
        updateCameraOrientation();
    };
    document.getElementById('camRoll').oninput = function(){ 
        camRoll = parseFloat(this.value) * Math.PI/180.0; 
        updateCameraOrientation();
    };
    
    document.getElementById('camTx').oninput = function(){ 
        // 计算相对于基础位置的偏移
        let tx = parseFloat(this.value);
        // 先将相机位置重置到基础位置，再应用平移
        vec3.copy(camPosition, camBasePosition);
        vec3.scaleAndAdd(camPosition, camPosition, camRight, tx);
        // 读取其他平移值并应用
        let ty = parseFloat(document.getElementById('camTy').value || '0');
        let tz = parseFloat(document.getElementById('camTz').value || '0');
        vec3.scaleAndAdd(camPosition, camPosition, camUp, ty);
        vec3.scaleAndAdd(camPosition, camPosition, camForward, tz);
    };
    document.getElementById('camTy').oninput = function(){ 
        let ty = parseFloat(this.value);
        vec3.copy(camPosition, camBasePosition);
        let tx = parseFloat(document.getElementById('camTx').value || '0');
        let tz = parseFloat(document.getElementById('camTz').value || '0');
        vec3.scaleAndAdd(camPosition, camPosition, camRight, tx);
        vec3.scaleAndAdd(camPosition, camPosition, camUp, ty);
        vec3.scaleAndAdd(camPosition, camPosition, camForward, tz);
    };
    document.getElementById('camTz').oninput = function(){ 
        let tz = parseFloat(this.value);
        vec3.copy(camPosition, camBasePosition);
        let tx = parseFloat(document.getElementById('camTx').value || '0');
        let ty = parseFloat(document.getElementById('camTy').value || '0');
        vec3.scaleAndAdd(camPosition, camPosition, camRight, tx);
        vec3.scaleAndAdd(camPosition, camPosition, camUp, ty);
        vec3.scaleAndAdd(camPosition, camPosition, camForward, tz);
    };

    // 投影模式
    document.getElementById('projPersp').onchange = function(){ projectionMode = 'persp'; };
    document.getElementById('projOrtho').onchange = function(){ projectionMode = 'ortho'; };
    document.getElementById('fovy').oninput = function(){ fovy = parseFloat(this.value) * Math.PI/180.0; };
    document.getElementById('near').oninput = function(){
        let v = parseFloat(this.value);
        // 限制从摄像机方向开始，且不超过far
        near = Math.max(0.01, Math.min(v, far - 0.01));
        this.value = near.toFixed(2);
        // 动态更新near的最大值为 far - epsilon
        this.max = (far - 0.01).toFixed(2);
    };
    document.getElementById('far').oninput = function(){
        let v = parseFloat(this.value);
        // 保证 far 不小于 near
        far = Math.max(near + 0.01, v);
        this.value = far.toFixed(2);
        // 更新near滑块的最大值
        let nearEl = document.getElementById('near');
        if(nearEl){ nearEl.max = (far - 0.01).toFixed(2); }
    };
    document.getElementById('orthoLeft').oninput = function(){ orthoLeft = parseFloat(this.value); };
    document.getElementById('orthoRight').oninput = function(){ orthoRight = parseFloat(this.value); };
    document.getElementById('orthoBottom').oninput = function(){ orthoBottom = parseFloat(this.value); };
    document.getElementById('orthoTop').oninput = function(){ orthoTop = parseFloat(this.value); };

    // 鼠标拖拽环绕视角与滚轮缩放
    let dragging = false, lastX = 0, lastY = 0;
    canvas.addEventListener('mousedown', function(e){ dragging = true; lastX = e.clientX; lastY = e.clientY; });
    window.addEventListener('mouseup', function(){ dragging = false; });
    // 更新相机方向的函数
    function updateCameraOrientation() {
        // 重置基础方向
        let baseForward = vec3.fromValues(0, 0, -1);
        let baseUp = vec3.fromValues(0, 1, 0);
        let baseRight = vec3.fromValues(1, 0, 0);
        
        // 创建旋转矩阵：先绕Y轴（偏航），再绕X轴（俯仰），最后绕Z轴（滚转）
        let rotation = mat4.create();
        mat4.identity(rotation);
        mat4.rotateY(rotation, rotation, camYaw);   // 偏航
        mat4.rotateX(rotation, rotation, camPitch); // 俯仰
        mat4.rotateZ(rotation, rotation, camRoll);  // 滚转
        
        // 应用旋转到基础方向向量
        vec3.transformMat4(camForward, baseForward, rotation);
        vec3.normalize(camForward, camForward);
        
        vec3.transformMat4(camUp, baseUp, rotation);
        vec3.normalize(camUp, camUp);
        
        // 计算右方向为前向和上方向的叉乘
        vec3.cross(camRight, camForward, camUp);
        vec3.normalize(camRight, camRight);
        
        // 重新正交化上方向，确保三个向量正交
        vec3.cross(camUp, camRight, camForward);
        vec3.normalize(camUp, camUp);
    }
    
    window.addEventListener('mousemove', function(e){
        if(!dragging) return;
        let dx = e.clientX - lastX;
        let dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        if(e.shiftKey){
            // Shift 拖拽：按当前相机旋转的右/上方向进行平移
            let panScale = 0.01;
            let panRight = -dx * panScale;
            let panUp = dy * panScale;
            
            // 计算当前的平移值
            let currentTx = parseFloat(document.getElementById('camTx').value || '0') + panRight;
            let currentTy = parseFloat(document.getElementById('camTy').value || '0') + panUp;
            let currentTz = parseFloat(document.getElementById('camTz').value || '0');
            
            // 更新平移值
            vec3.copy(camPosition, camBasePosition);
            vec3.scaleAndAdd(camPosition, camPosition, camRight, currentTx);
            vec3.scaleAndAdd(camPosition, camPosition, camUp, currentTy);
            vec3.scaleAndAdd(camPosition, camPosition, camForward, currentTz);
            
            // 更新滑块值
            let txEl = document.getElementById('camTx');
            let tyEl = document.getElementById('camTy');
            if(txEl){ txEl.value = currentTx.toFixed(2); }
            if(tyEl){ tyEl.value = currentTy.toFixed(2); }
        }else{
            // 默认拖拽：绕自身Y轴（偏航）和X轴（俯仰）旋转
            camYaw += dx * 0.005; // 绕自身Y轴（偏航）
            camPitch += dy * 0.005; // 绕自身X轴（俯仰）
            updateCameraOrientation();
        }
    });
    canvas.addEventListener('wheel', function(e){
        e.preventDefault();
        // 滚轮缩放：沿相机前向移动相机
        let zoomScale = (e.deltaY > 0 ? 1.05 : 0.95);
        vec3.scaleAndAdd(camPosition, camPosition, camForward, 
                         vec3.length(camPosition) * (zoomScale - 1.0));
    }, { passive: false });

    // 键盘：方向键旋转视角，W/S 前进后退；A/D 调 near/far
    window.addEventListener('keydown', function(e){
        switch(e.key){
            case 'ArrowLeft': 
                camYaw -= 2*Math.PI/180.0; 
                updateCameraOrientation();
                break;
            case 'ArrowRight': 
                camYaw += 2*Math.PI/180.0; 
                updateCameraOrientation();
                break;
            case 'ArrowUp': 
                camPitch += 2*Math.PI/180.0; 
                updateCameraOrientation();
                break;
            case 'ArrowDown': 
                camPitch -= 2*Math.PI/180.0; 
                updateCameraOrientation();
                break;
            case 'w': case 'W': 
                // 前进：沿相机前向移动
                let currentTz = parseFloat(document.getElementById('camTz').value || '0') - 0.1;
                document.getElementById('camTz').value = currentTz.toFixed(2);
                // 应用所有平移值
                vec3.copy(camPosition, camBasePosition);
                let tx = parseFloat(document.getElementById('camTx').value || '0');
                let ty = parseFloat(document.getElementById('camTy').value || '0');
                vec3.scaleAndAdd(camPosition, camPosition, camRight, tx);
                vec3.scaleAndAdd(camPosition, camPosition, camUp, ty);
                vec3.scaleAndAdd(camPosition, camPosition, camForward, currentTz);
                break;
            case 's': case 'S': 
                // 后退：沿相机前向反向移动
                currentTz = parseFloat(document.getElementById('camTz').value || '0') + 0.1;
                document.getElementById('camTz').value = currentTz.toFixed(2);
                // 应用所有平移值
                vec3.copy(camPosition, camBasePosition);
                tx = parseFloat(document.getElementById('camTx').value || '0');
                ty = parseFloat(document.getElementById('camTy').value || '0');
                vec3.scaleAndAdd(camPosition, camPosition, camRight, tx);
                vec3.scaleAndAdd(camPosition, camPosition, camUp, ty);
                vec3.scaleAndAdd(camPosition, camPosition, camForward, currentTz);
                break;
            case 'a': case 'A': 
                // 向左移动：沿相机右方向反向移动
                let currentTx = parseFloat(document.getElementById('camTx').value || '0') - 0.1;
                document.getElementById('camTx').value = currentTx.toFixed(2);
                // 应用所有平移值
                vec3.copy(camPosition, camBasePosition);
                ty = parseFloat(document.getElementById('camTy').value || '0');
                vec3.scaleAndAdd(camPosition, camPosition, camRight, currentTx);
                vec3.scaleAndAdd(camPosition, camPosition, camUp, ty);
                vec3.scaleAndAdd(camPosition, camPosition, camForward, parseFloat(document.getElementById('camTz').value || '0'));
                break;
            case 'd': case 'D': 
                // 向右移动：沿相机右方向移动
                currentTx = parseFloat(document.getElementById('camTx').value || '0') + 0.1;
                document.getElementById('camTx').value = currentTx.toFixed(2);
                // 应用所有平移值
                vec3.copy(camPosition, camBasePosition);
                ty = parseFloat(document.getElementById('camTy').value || '0');
                vec3.scaleAndAdd(camPosition, camPosition, camRight, currentTx);
                vec3.scaleAndAdd(camPosition, camPosition, camUp, ty);
                vec3.scaleAndAdd(camPosition, camPosition, camForward, parseFloat(document.getElementById('camTz').value || '0'));
                break;
            case 'a': case 'A': {
                let nearEl = document.getElementById('near');
                let farEl = document.getElementById('far');
                near = Math.max(0.01, Math.min(near*0.95, far - 0.01));
                far = Math.max(near + 0.01, far*0.95);
                if(nearEl){ nearEl.value = near.toFixed(2); nearEl.max = (far - 0.01).toFixed(2); }
                if(farEl){ farEl.value = far.toFixed(2); }
                break;
            }
            case 'd': case 'D': {
                let nearEl = document.getElementById('near');
                let farEl = document.getElementById('far');
                near = Math.min(far - 0.01, near*1.05);
                far = Math.max(near + 0.01, far*1.05);
                if(nearEl){ nearEl.value = near.toFixed(2); nearEl.max = (far - 0.01).toFixed(2); }
                if(farEl){ farEl.value = far.toFixed(2); }
                break;
            }
        }
    });

    // 复位按钮扩展重置摄像机与投影
    document.getElementById('btnReset').onclick = function(){
        rx = ry = rz = 0.0;
        scaleVal = 1.0;
        document.getElementById("rx").value = 0;
        document.getElementById("ry").value = 0;
        document.getElementById("rz").value = 0;
        document.getElementById("scale").value = 1;
        document.getElementById("alpha").value = model.alpha;
        
        // 重置相机参数
        camPitch = 0.0;
        camYaw = 0.0;
        camRoll = 0.0;
        document.getElementById("camTheta").value = 0;
        document.getElementById("camPhi").value = 0;
        document.getElementById("camRoll").value = 0;
        document.getElementById("camTx").value = 0;
        document.getElementById("camTy").value = 0;
        document.getElementById("camTz").value = 0;
        
        // 重置相机方向和位置
        camForward = vec3.fromValues(0.0, 0.0, -1.0);
        camUp = vec3.fromValues(0.0, 1.0, 0.0);
        camRight = vec3.fromValues(1.0, 0.0, 0.0);
        camBasePosition = vec3.fromValues(0.0, 0.0, 5.0);
        camPosition = vec3.clone(camBasePosition);
        
        if(model.mesh){
            computeBoundsAndAdapt(model.mesh);
        }else{
            tx = ty = tz = 0.0;
            document.getElementById("tx").value = 0;
            document.getElementById("ty").value = 0;
            document.getElementById("tz").value = 0;
        }
    };
}

function buildWireIndices(mesh){
    // 由三角面索引生成线段索引
    let tri = mesh.indices;
    let lines = [];
    for(let i=0; i+2<tri.length; i+=3){
        let i0 = tri[i], i1 = tri[i+1], i2 = tri[i+2];
        lines.push(i0, i1, i1, i2, i2, i0);
    }
    mesh.wireIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.wireIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(lines), gl.STATIC_DRAW);
    mesh.wireIndexBuffer.itemSize = 1;
    mesh.wireIndexBuffer.numItems = lines.length;
}

function render(){
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 使用相机自身的方向向量和位置
    let forward = vec3.clone(camForward);
    let upVec = vec3.clone(camUp);
    let right = vec3.clone(camRight);
    let camPos = vec3.clone(camPosition);

    // 视点和观察点：观察点在相机前方一小段距离
    eye = vec3.clone(camPos);
    at = vec3.create();
    vec3.scaleAndAdd(at, eye, forward, 1.0); // 观察点在相机前方1个单位
    
    // 创建视图矩阵
    mat4.lookAt(mvMatrix, eye, at, upVec);

    // 模型平移沿相机轴叠加初始居中偏移
    let tCam = vec3.create();
    vec3.scaleAndAdd(tCam, tCam, right, tx);
    vec3.scaleAndAdd(tCam, tCam, upVec, ty);
    vec3.scaleAndAdd(tCam, tCam, forward, tz);
    let tWorld = vec3.fromValues(modelCenterX, modelCenterY, modelCenterZ);
    vec3.add(tWorld, tWorld, tCam);

    // 模型变换：T * Rx * Ry * Rz * S
    let M = mat4.create();
    mat4.translate(M, M, tWorld);
    mat4.rotateX(M, M, rx);
    mat4.rotateY(M, M, ry);
    mat4.rotateZ(M, M, rz);
    mat4.scale(M, M, vec3.fromValues(scaleVal, scaleVal, scaleVal));
    mat4.mul(mvMatrix, mvMatrix, M);

    // 法线矩阵
    mat3.normalFromMat4(normalMatrix, mvMatrix);

    // 投影
    let aspect = canvas.width / canvas.height;
    if(projectionMode === 'persp'){
        mat4.perspective(pMatrix, fovy, aspect, near, far);
    }else{
        mat4.ortho(pMatrix, orthoLeft, orthoRight, orthoBottom, orthoTop, near, far);
    }

    // uniforms
    let uMV = gl.getUniformLocation(program, 'modelViewMatrix');
    let uPM = gl.getUniformLocation(program, 'projectionMatrix');
    let uNM = gl.getUniformLocation(program, 'normalMatrix');
    let uColor = gl.getUniformLocation(program, 'uColor');
    let uAlpha = gl.getUniformLocation(program, 'uAlpha');
    let uLightDir = gl.getUniformLocation(program, 'uLightDir');

    gl.uniformMatrix4fv(uMV, false, mvMatrix);
    gl.uniformMatrix4fv(uPM, false, pMatrix);
    gl.uniformMatrix3fv(uNM, false, normalMatrix);
    gl.uniform3fv(uColor, model.color);
    gl.uniform1f(uAlpha, model.alpha);
    gl.uniform3fv(uLightDir, new Float32Array([0.5, 0.7, 1.0]));

    if(model.mesh){
        // 绑定顶点
        gl.bindBuffer(gl.ARRAY_BUFFER, model.mesh.vertexBuffer);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, model.mesh.normalBuffer);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(1);

        if(model.renderMode === 'solid'){
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.mesh.indexBuffer);
            gl.drawElements(gl.TRIANGLES, model.mesh.indexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
        }else{
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.mesh.wireIndexBuffer);
            gl.drawElements(gl.LINES, model.mesh.wireIndexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
        }
    }

    requestAnimFrame(render);
}


// 计算包围盒并适配控件/相机
function computeBoundsAndAdapt(mesh){
    if(!mesh || !mesh.vertices || mesh.vertices.length < 3) return;
    let v = mesh.vertices;
    let minX=Infinity, minY=Infinity, minZ=Infinity;
    let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
    for(let i=0;i<v.length;i+=3){
        let x=v[i], y=v[i+1], z=v[i+2];
        if(x<minX) minX=x; if(y<minY) minY=y; if(z<minZ) minZ=z;
        if(x>maxX) maxX=x; if(y>maxY) maxY=y; if(z>maxZ) maxZ=z;
    }
    let cx=(minX+maxX)/2, cy=(minY+maxY)/2, cz=(minZ+maxZ)/2;
    let hx=(maxX-minX)/2, hy=(maxY-minY)/2, hz=(maxZ-minZ)/2;
    let radius=Math.sqrt(hx*hx+hy*hy+hz*hz);
    model.bounds = { center: [cx,cy,cz], halfExtents: [hx,hy,hz], radius: radius };

    // 记录初始居中偏移（世界坐标），让用户平移与之叠加；用户平移改为沿相机轴
    modelCenterX = -cx; modelCenterY = -cy; modelCenterZ = -cz;
    let txEl=document.getElementById('tx');
    let tyEl=document.getElementById('ty');
    let tzEl=document.getElementById('tz');
    let range = Math.max(hx, hy, hz) * 4; // 扩大范围
    [txEl,tyEl,tzEl].forEach(el=>{ el.min = (-range).toFixed(2); el.max = (range).toFixed(2); });
    tx = 0; ty = 0; tz = 0; // UI 从 0 开始（沿相机轴）
    txEl.value = tx.toFixed(2); tyEl.value = ty.toFixed(2); tzEl.value = tz.toFixed(2);

    // 计算相机距离以适配当前 FOV 与画布比例
    let aspect = canvas.width / canvas.height;
    let halfW = hx, halfH = hy;
    let tanHalfFovy = Math.tan(fovy/2);
    let dH = halfH / tanHalfFovy;
    let dW = halfW / (tanHalfFovy * aspect);
    let d = Math.max(dH, dW) * 1.15;

    // 重置相机平移值
    document.getElementById('camTx').value = 0;
    document.getElementById('camTy').value = 0;
    document.getElementById('camTz').value = 0;
    
    // 更新相机基础位置，使相机位于模型正前方适当距离
    camBasePosition = vec3.fromValues(0, 0, d);
    camPosition = vec3.clone(camBasePosition);
    
    // 更新相机半径滑块范围
    let camEl = document.getElementById('camRadius');
    camEl.max = Math.max(parseFloat(camEl.max)||30, d*1.5).toFixed(2);
    camEl.value = d.toFixed(2);

    // 近远裁剪面自动适配（保持不变）
    let nearEl=document.getElementById('near');
    let farEl=document.getElementById('far');
    let margin = radius * 0.5;
    near = Math.max(0.01, d - (radius + margin));
    far = d + (radius + margin);
    farEl.max = Math.max(parseFloat(farEl.max)||100, far*1.3).toFixed(2);
    nearEl.value = near.toFixed(2);
    farEl.value = far.toFixed(2);

    // 正交六面参数适配（保持不变）
    let aspect2 = canvas.width / canvas.height;
    let orthoH = Math.max(hy, hx / aspect2) * 1.1;
    let orthoW = orthoH * aspect2;
    orthoLeft = -orthoW; orthoRight = orthoW;
    orthoBottom = -orthoH; orthoTop = orthoH;

    let leftEl = document.getElementById('orthoLeft');
    let rightEl = document.getElementById('orthoRight');
    let bottomEl = document.getElementById('orthoBottom');
    let topEl = document.getElementById('orthoTop');

    const expand = 2.0;
    leftEl.min = (-orthoW*expand).toFixed(2); leftEl.max = (orthoW*expand).toFixed(2); leftEl.value = orthoLeft.toFixed(2);
    rightEl.min = (-orthoW*expand).toFixed(2); rightEl.max = (orthoW*expand).toFixed(2); rightEl.value = orthoRight.toFixed(2);
    bottomEl.min = (-orthoH*expand).toFixed(2); bottomEl.max = (orthoH*expand).toFixed(2); bottomEl.value = orthoBottom.toFixed(2);
    topEl.min = (-orthoH*expand).toFixed(2); topEl.max = (orthoH*expand).toFixed(2); topEl.value = orthoTop.toFixed(2);

    // 可选：缩放滑块上限加大
    let scaleEl=document.getElementById('scale');
    scaleEl.max = Math.max(parseFloat(scaleEl.max)||3, 5).toFixed(2);
}


function clampModelWithinFar(){
    if(!model.bounds) return;
    let center = vec3.fromValues(tx, ty, tz);
    let diff = vec3.create(); vec3.sub(diff, center, camPosition);
    let dist = Math.hypot(diff[0], diff[1], diff[2]);
    let maxDist = Math.max(0.01, far - model.bounds.radius - 0.01);
    if(dist > maxDist){
        let scale = maxDist / dist;
        let clamped = vec3.create(); vec3.scale(clamped, diff, scale);
        vec3.add(clamped, camPosition, clamped);
        tx = clamped[0]; ty = clamped[1]; tz = clamped[2];
        let txEl=document.getElementById('tx');
        let tyEl=document.getElementById('ty');
        let tzEl=document.getElementById('tz');
        if(txEl) txEl.value = tx.toFixed(2);
        if(tyEl) tyEl.value = ty.toFixed(2);
        if(tzEl) tzEl.value = tz.toFixed(2);
    }
}