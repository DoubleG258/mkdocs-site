/**
 * 实验6和实验7的OBJ模型加载器
 * 支持加载任意OBJ模型并集成到WebGL渲染器中
 */

(function() {
    'use strict';

    /**
     * 模型加载器类
     */
    class ModelLoader {
        constructor() {
            this.meshes = {};
            this.loaded = false;
            this.currentModel = null;
        }

        /**
         * 加载猫模型
         * @param {string} modelPath - 模型文件路径
         * @returns {Promise} 加载完成的Promise
         */
        loadCatModel(modelPath) {
            return new Promise((resolve, reject) => {
                // 使用现有的OBJ加载器
                OBJ.downloadMeshes({
                    'cat': modelPath
                }, (meshes) => {
                    this.meshes.cat = meshes.cat;
                    this.meshes.cat.inited = false; // 初始化inited标志
                    this.currentModel = 'cat';
                    this.loaded = true;
                    console.log('猫模型加载成功，顶点数:', this.meshes.cat.vertices.length / 3);
                    console.log('模型边界框:', {
                        xmin: this.meshes.cat.xmin,
                        xmax: this.meshes.cat.xmax,
                        ymin: this.meshes.cat.ymin,
                        ymax: this.meshes.cat.ymax,
                        zmin: this.meshes.cat.zmin,
                        zmax: this.meshes.cat.zmax
                    });
                    resolve(this.meshes.cat);
                }, this.meshes);
            });
        }

        /**
         * 通过文件选择器加载OBJ模型
         * @param {File} file - OBJ文件对象
         * @returns {Promise} 加载完成的Promise
         */
        loadModelFromFile(file) {
            return new Promise((resolve, reject) => {
                if (!file || (file.type !== 'text/plain' && !file.name.endsWith('.obj'))) {
                    reject(new Error('请选择有效的OBJ文件'));
                    return;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const objData = event.target.result;
                        const mesh = new OBJ.Mesh(objData);
                        
                        // 使用文件名作为模型名称
                        const modelName = file.name.replace('.obj', '');
                        this.meshes[modelName] = mesh;
                        this.meshes[modelName].inited = false; // 初始化inited标志
                        this.currentModel = modelName;
                        this.loaded = true;
                        
                        console.log('模型加载成功:', modelName);
                        console.log('顶点数:', mesh.vertices.length / 3);
                        console.log('模型边界框:', {
                            xmin: mesh.xmin,
                            xmax: mesh.xmax,
                            ymin: mesh.ymin,
                            ymax: mesh.ymax,
                            zmin: mesh.zmin,
                            zmax: mesh.zmax
                        });
                        
                        resolve(mesh);
                    } catch (error) {
                        reject(new Error('OBJ文件解析失败: ' + error.message));
                    }
                };

                reader.onerror = () => {
                    reject(new Error('文件读取失败'));
                };

                reader.readAsText(file);
            });
        }

        /**
         * 初始化WebGL缓冲区
         * @param {WebGLRenderingContext} gl - WebGL上下文
         * @param {string} modelName - 模型名称
         */
        initBuffers(gl, modelName = null) {
            // 如果没有指定模型名称，使用当前模型
            if (!modelName) {
                modelName = this.currentModel;
            }
            
            if (!modelName || !this.meshes[modelName]) {
                console.error('模型未加载:', modelName);
                return false;
            }

            const mesh = this.meshes[modelName];
            
            if (!mesh.inited) {
                try {
                    // 确保模型有必要的属性
                    if (!mesh.vertices || mesh.vertices.length === 0) {
                        console.error('模型没有顶点数据:', modelName);
                        return false;
                    }
                    
                    // 初始化WebGL缓冲区（OBJ默认使用Uint16索引）
                    OBJ.initMeshBuffers(gl, mesh);

                    if (!mesh.vertexBuffer || !mesh.indexBuffer) {
                        console.error('WebGL缓冲区创建失败:', modelName);
                        return false;
                    }

                    let maxIndex = 0;
                    for (let i = 0; i < mesh.indices.length; i++) {
                        if (mesh.indices[i] > maxIndex) maxIndex = mesh.indices[i];
                    }
                    const useUint32 = maxIndex > 65535;
                    if (useUint32) {
                        const idxBuf = gl.createBuffer();
                        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
                        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mesh.indices), gl.STATIC_DRAW);
                        idxBuf.itemSize = 1;
                        idxBuf.numItems = mesh.indices.length;
                        mesh.indexBuffer = idxBuf;
                        mesh.indexType = gl.UNSIGNED_INT;
                    } else {
                        mesh.indexType = gl.UNSIGNED_SHORT;
                    }

                    const vCount = mesh.vertices.length / 3;
                    const needNormals = !mesh.vertexNormals || mesh.vertexNormals.length === 0;
                    if (needNormals && vCount > 0) {
                        const normals = new Float32Array(vCount * 3);
                        const verts = mesh.vertices;
                        for (let i = 0; i < mesh.indices.length; i += 3) {
                            const i0 = mesh.indices[i];
                            const i1 = mesh.indices[i + 1];
                            const i2 = mesh.indices[i + 2];
                            const v0x = verts[i0 * 3], v0y = verts[i0 * 3 + 1], v0z = verts[i0 * 3 + 2];
                            const v1x = verts[i1 * 3], v1y = verts[i1 * 3 + 1], v1z = verts[i1 * 3 + 2];
                            const v2x = verts[i2 * 3], v2y = verts[i2 * 3 + 1], v2z = verts[i2 * 3 + 2];
                            const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
                            const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;
                            const nx = e1y * e2z - e1z * e2y;
                            const ny = e1z * e2x - e1x * e2z;
                            const nz = e1x * e2y - e1y * e2x;
                            normals[i0 * 3] += nx; normals[i0 * 3 + 1] += ny; normals[i0 * 3 + 2] += nz;
                            normals[i1 * 3] += nx; normals[i1 * 3 + 1] += ny; normals[i1 * 3 + 2] += nz;
                            normals[i2 * 3] += nx; normals[i2 * 3 + 1] += ny; normals[i2 * 3 + 2] += nz;
                        }
                        for (let i = 0; i < vCount; i++) {
                            const x = normals[i * 3], y = normals[i * 3 + 1], z = normals[i * 3 + 2];
                            const len = Math.hypot(x, y, z) || 1;
                            normals[i * 3] = x / len;
                            normals[i * 3 + 1] = y / len;
                            normals[i * 3 + 2] = z / len;
                        }
                        mesh.vertexNormals = Array.from(normals);
                        mesh.normalBuffer = gl.createBuffer();
                        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
                        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
                        mesh.normalBuffer.itemSize = 3;
                        mesh.normalBuffer.numItems = vCount;
                    }

                    if (mesh.indices && mesh.indices.length > 0) {
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
                        for (let i = 0; i < mesh.indices.length; i += 3) {
                            const i0 = mesh.indices[i];
                            const i1 = mesh.indices[i + 1];
                            const i2 = mesh.indices[i + 2];
                            pushEdge(i0, i1);
                            pushEdge(i1, i2);
                            pushEdge(i2, i0);
                        }
                        const WireType = useUint32 ? Uint32Array : Uint16Array;
                        const wireBuf = gl.createBuffer();
                        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wireBuf);
                        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new WireType(edges), gl.STATIC_DRAW);
                        wireBuf.itemSize = 1;
                        wireBuf.numItems = edges.length;
                        mesh.wireframeIndexBuffer = wireBuf;
                        mesh.wireframeIndexType = useUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
                    }

                    mesh.inited = true;
                    console.log('WebGL缓冲区初始化完成:', modelName);
                    console.log('顶点数:', mesh.vertices.length / 3);
                    console.log('面片数:', mesh.indices.length / 3);
                    
                } catch (error) {
                    console.error('缓冲区初始化失败:', error);
                    return false;
                }
            }

            return true;
        }

        /**
         * 渲染模型
         * @param {WebGLRenderingContext} gl - WebGL上下文
         * @param {Object} attribLocations - 属性位置对象
         * @param {string} modelName - 模型名称
         * @param {boolean} wireframe - 是否线框模式
         */
        render(gl, attribLocations, modelName = null, wireframe = false) {
            // 如果没有指定模型名称，使用当前模型
            if (!modelName) {
                modelName = this.currentModel;
            }
            
            if (!modelName || !this.meshes[modelName]) {
                console.error('模型未加载:', modelName);
                return;
            }

            const mesh = this.meshes[modelName];
            
            if (!mesh.inited) {
                console.error('模型未初始化:', modelName);
                return;
            }

            try {
                // 绑定顶点缓冲区
                if (attribLocations.position !== undefined && attribLocations.position !== -1) {
                    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer);
                    gl.vertexAttribPointer(
                        attribLocations.position,
                        mesh.vertexBuffer.itemSize,
                        gl.FLOAT,
                        false,
                        0,
                        0
                    );
                    gl.enableVertexAttribArray(attribLocations.position);
                }

                // 绑定法线缓冲区（如果有法线数据且着色器声明了法线）
                if (attribLocations.normal !== undefined && attribLocations.normal !== -1 && mesh.normalBuffer) {
                    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
                    gl.vertexAttribPointer(
                        attribLocations.normal,
                        mesh.normalBuffer.itemSize,
                        gl.FLOAT,
                        false,
                        0,
                        0
                    );
                    gl.enableVertexAttribArray(attribLocations.normal);
                }

                const useWire = !!wireframe && !!mesh.wireframeIndexBuffer;
                const indexBuffer = useWire ? mesh.wireframeIndexBuffer : mesh.indexBuffer;
                const indexType = useWire ? (mesh.wireframeIndexType || mesh.indexType || gl.UNSIGNED_SHORT)
                                          : (mesh.indexType || gl.UNSIGNED_SHORT);
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

                // 线框绘制时关闭面剔除，避免边被剔除
                let cullWasEnabled = gl.isEnabled(gl.CULL_FACE);
                if (useWire && cullWasEnabled) gl.disable(gl.CULL_FACE);
                gl.drawElements(useWire ? gl.LINES : gl.TRIANGLES, indexBuffer.numItems, indexType, 0);
                if (useWire && cullWasEnabled) gl.enable(gl.CULL_FACE);

            } catch (error) {
                console.error('模型渲染失败:', error);
            }
        }

        /**
         * 获取模型边界信息
         * @param {string} modelName - 模型名称
         * @returns {Object} 边界信息
         */
        getBoundingBox(modelName = 'cat') {
            if (!this.meshes[modelName]) {
                return null;
            }

            const mesh = this.meshes[modelName];
            return {
                xmin: mesh.xmin,
                xmax: mesh.xmax,
                ymin: mesh.ymin,
                ymax: mesh.ymax,
                zmin: mesh.zmin,
                zmax: mesh.zmax,
                width: mesh.xmax - mesh.xmin,
                height: mesh.ymax - mesh.ymin,
                depth: mesh.zmax - mesh.zmin
            };
        }

        /**
         * 获取模型中心点
         * @param {string} modelName - 模型名称
         * @returns {Array} 中心点坐标 [x, y, z]
         */
        getCenter(modelName = 'cat') {
            const bbox = this.getBoundingBox(modelName);
            if (!bbox) return [0, 0, 0];

            return [
                (bbox.xmin + bbox.xmax) / 2,
                (bbox.ymin + bbox.ymax) / 2,
                (bbox.zmin + bbox.zmax) / 2
            ];
        }

        /**
         * 获取模型缩放比例，使其适合显示
         * @param {string} modelName - 模型名称
         * @param {number} targetSize - 目标尺寸（默认2）
         * @returns {number} 缩放比例
         */
        getAutoScale(modelName = 'cat', targetSize = 2) {
            const bbox = this.getBoundingBox(modelName);
            if (!bbox) return 1;

            const maxDimension = Math.max(bbox.width, bbox.height, bbox.depth);
            return targetSize / maxDimension;
        }

        /**
         * 清理资源
         * @param {WebGLRenderingContext} gl - WebGL上下文
         */
        cleanup(gl) {
            for (const modelName in this.meshes) {
                if (this.meshes[modelName].inited) {
                    OBJ.deleteMeshBuffers(gl, this.meshes[modelName]);
                }
            }
            this.meshes = {};
            this.loaded = false;
        }
    }

    // 导出到全局作用域
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ModelLoader;
    } else {
        window.ModelLoader = ModelLoader;
    }
})();