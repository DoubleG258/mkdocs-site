"use strict";

const{vec3, vec4, mat3, mat4} = glMatrix;

function Renderer( canvasName )
{
	// 光源参数
	this.lightPosition = vec4.fromValues( 5.0, 5.0, 5.0, 0.0 );
	this.lightAmbient = vec4.fromValues( 0.2, 0.2, 0.2, 1.0 );
	this.lightDiffuse = vec4.fromValues( 1.0, 1.0, 1.0, 1.0 );
	this.lightSpecular = vec4.fromValues( 1.0, 1.0, 1.0, 1.0 );

	// 材质参数
	this.materialAmbient = vec4.fromValues( 1.0, 0.0, 1.0, 1.0 );
	this.materialDiffuse = vec4.fromValues( 1.0, 0.0, 0.0, 1.0 );
	this.materialSpecular = vec4.fromValues( 1.0, 1.0, 1.0, 1.0 );
	this.materialShininess = 20.0;

	this.clearColor = vec4.fromValues( 0.0, 1.0, 1.0, 1.0 );

	// 私有成员
	var canvas;
	var gl;

	// 正四面体的四个顶点（单位球面上的点）
	var va = vec4.fromValues(0.0, 0.0, -1.0, 1);
	var vb = vec4.fromValues(0.0, 0.942809, 0.333333, 1);
	var vc = vec4.fromValues(-0.816497, -0.471405, 0.333333, 1);
	var vd = vec4.fromValues(0.816497, -0.471405, 0.333333, 1);

	// 相机参数
	var near = -10;
	var far = 10;
	var radius = 1.5;
	var theta = 0.0;
	var phi = 0.0;
	var stept = 5.0 * Math.PI / 180.0;
	var stepm = 0.1;

	var left = -5.0;
	var right = 5.0;
	var ytop = 5.0;
	var bottom = -5.0;

	var eye = vec3.create();
	var at = vec3.fromValues( 0.0, 0.0, 0.0 );
	var up = vec3.fromValues( 0.0, 1.0, 0.0 );

	// 几何数据
	var points = [];
	var normals = [];
	var index = 0;

	var vBuffer = null;
	var nBuffer = null;

	var numOfSubdivides = 2;

	// 着色器相关
	var progID = 0;
	var vertID = 0;
	var fragID = 0;

	var vertexLoc = 0;
	var normalLoc = 0;

	var ambientProdLoc = 0;
	var diffuseProdLoc = 0;
	var specularProdLoc = 0;

	var modelViewMatrix = mat4.create();
	var projectionMatrix = mat4.create();
	var modelViewMatrixLoc = 0;
	var projectionMatrixLoc = 0;

	var lightPositionLoc = 0;
	var shininessLoc = 0;

	var normalMatrix = mat3.create();
	var normalMatrixLoc = 0;

	var currentKey = [];

	// 顶点着色器源码 - Phong着色
	var vertSrc = `#version 300 es
in vec4 vPosition;
in vec4 vNormal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

uniform vec4 lightPosition;

out vec3 normalInterp;
out vec4 vertexPos;

void main(){
	vertexPos = modelViewMatrix * vPosition;
	normalInterp = normalize(normalMatrix * vNormal.xyz);
	gl_Position = projectionMatrix * vertexPos;
}
`;

	// 片段着色器源码 - Phong着色
	var fragSrc = `#version 300 es
precision mediump float;

in vec3 normalInterp;
in vec4 vertexPos;

uniform vec4 lightPosition;
uniform float shininess;

uniform vec4 ambientProduct;
uniform vec4 diffuseProduct;
uniform vec4 specularProduct;

out vec4 fColor;

void main()
{
	vec3 N = normalize( normalInterp );
	vec3 L;
	
	if( lightPosition.w == 0.0 )
		L = normalize( lightPosition.xyz );
	else
		L = normalize( lightPosition.xyz - vertexPos.xyz );

	vec4 ambient = ambientProduct;

	float Kd = max( dot( L, N ), 0.0 );
	vec4 diffuse = Kd * diffuseProduct;

	float Ks = 0.0;

	if( Kd > 0.0 )
	{
		vec3 R = reflect( -L, N );
		vec3 V = normalize( -vertexPos.xyz );
		float speculaAngle = max( dot( R, V ), 0.0 );
		Ks = pow( speculaAngle, shininess );
	}
	vec4 specular = Ks * specularProduct;

	fColor = ambient + diffuse + specular;
	fColor.a = 1.0;
}
`;

	this.init = function(){
		this.canvas = document.getElementById( "gl-canvas" );
		try{
			gl = this.canvas.getContext("webgl2");
		}catch( e ){
			if( !gl ){
				window.alert( "Error: WebGL isn't available" );
			}
		}

		gl.clearColor( this.clearColor[0], this.clearColor[1], this.clearColor[2], this.clearColor[3] );
		gl.viewport( 0, 0, this.canvas.width, this.canvas.height );
		gl.enable( gl.DEPTH_TEST );

		setupShaders();

		initSphere();
		initBuffers();
		initShaderBuffers();

		var self = this;
		document.onkeydown = function(event) { self.handleKeyDown(event); };
		document.onkeyup = function(event) { self.handleKeyUp(event); };
	}

	function initSphere(){
		points = [];
		normals = [];
		index = 0;
		divideTetra( va, vb, vc, vd, numOfSubdivides );
	}

	function initBuffers(){
		vBuffer = gl.createBuffer();
		nBuffer = gl.createBuffer();
	}

	function initShaderBuffers(){
		gl.bindBuffer( gl.ARRAY_BUFFER, vBuffer );
		gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( points ), gl.STATIC_DRAW );

		gl.vertexAttribPointer( vertexLoc, 4, gl.FLOAT, false, 0, 0 );
		gl.enableVertexAttribArray( vertexLoc );

		gl.bindBuffer( gl.ARRAY_BUFFER, nBuffer );
		gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( normals ), gl.STATIC_DRAW );

		gl.vertexAttribPointer( normalLoc, 4, gl.FLOAT, false, 0, 0 );
		gl.enableVertexAttribArray( normalLoc );
	}

	this.display = function(){
		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

		gl.useProgram( progID );

		var ambientProduct = vec4.create();
		vec4.multiply( ambientProduct, this.lightAmbient, this.materialAmbient );

		var diffuseProduct = vec4.create();
		vec4.multiply( diffuseProduct, this.lightDiffuse, this.materialDiffuse );

		var specularProduct = vec4.create();
		vec4.multiply(specularProduct, this.lightSpecular, this.materialSpecular );

		vec3.set( eye, radius * Math.sin( theta ) * Math.cos( phi ),
			radius * Math.sin( theta ) * Math.sin( phi ),
			radius * Math.cos( theta ) );

		mat4.lookAt( modelViewMatrix, eye, at, up );
		mat4.ortho( projectionMatrix, left, right, bottom, ytop, near, far );

		mat3.fromMat4( normalMatrix, modelViewMatrix );

		gl.uniform4fv( ambientProdLoc, new Float32Array( ambientProduct ) );
		gl.uniform4fv( diffuseProdLoc, new Float32Array( diffuseProduct ) );
		gl.uniform4fv( specularProdLoc, new Float32Array( specularProduct ) );
		gl.uniform4fv( lightPositionLoc, new Float32Array( this.lightPosition ) );
		gl.uniform1f( shininessLoc, this.materialShininess );

		gl.uniformMatrix4fv( modelViewMatrixLoc, false, new Float32Array( modelViewMatrix ) );
		gl.uniformMatrix4fv( projectionMatrixLoc, false, new Float32Array( projectionMatrix ) );
		gl.uniformMatrix3fv( normalMatrixLoc, false, new Float32Array( normalMatrix ) );

		gl.drawArrays(gl.TRIANGLES, 0, points.length/4 );
	}

	function triangle( a, b, c ){
		points.push( a[0], a[1], a[2], a[3] );
		points.push( b[0], b[1], b[2], b[3] );
		points.push( c[0], c[1], c[2], c[3] );

		// 计算面法线
		var t1 = vec4.create();
		vec4.subtract( t1, b, a );
		var t2 = vec4.create();
		vec4.subtract( t2, c, a );

		var n = vec4.create();
		var n1 = vec3.create();
		vec3.cross( n1, vec3.fromValues(t1[0], t1[1], t1[2]), vec3.fromValues( t2[0], t2[1], t2[2] ) );
		vec3.normalize( n1, n1 );
		vec4.set( n, n1[0], n1[1], n1[2], 0.0 );

		normals.push( n[0], n[1], n[2], 0.0 );
		normals.push( n[0], n[1], n[2], 0.0 );
		normals.push( n[0], n[1], n[2], 0.0 );

		index += 3;
	}

	function divideTriangle( a, b, c, n ){
		if( n > 0 ){
			var ab = vec4.create();
			vec4.lerp( ab, a, b, 0.5 );
			var abt = vec3.fromValues( ab[0], ab[1], ab[2] );
			vec3.normalize( abt, abt );
			vec4.set( ab, abt[0], abt[1], abt[2], 1.0 );

			var bc = vec4.create();
			vec4.lerp( bc, b, c, 0.5 );
			var bct = vec3.fromValues( bc[0], bc[1], bc[2] );
			vec3.normalize( bct, bct );
			vec4.set( bc, bct[0], bct[1], bct[2], 1.0 );

			var ac = vec4.create();
			vec4.lerp( ac, a, c, 0.5 );
			var act = vec3.fromValues( ac[0], ac[1], ac[2] );
			vec3.normalize( act, act );
			vec4.set( ac, act[0], act[1], act[2], 1.0 );

			divideTriangle( a, ab, ac, n - 1 );
			divideTriangle( ab, b, bc, n - 1 );
			divideTriangle( bc, c, ac, n - 1 );
			divideTriangle( ab, bc, ac, n - 1 );
		}else{
			triangle( a, b, c );
		}
	}

	function divideTetra( a, b, c, d, n ){
		divideTriangle( a, b, c, n );
		divideTriangle( d, c, b, n );
		divideTriangle( a, d, b, n );
		divideTriangle( a, c, d, n );
	}

	// 公共方法 - 设置细分级别
	this.setSubdivisions = function( n ){
		numOfSubdivides = n;
		// 更新界面控件
		if( document.getElementById( "subdivisions" ) ){
			document.getElementById( "subdivisions" ).value = n;
		}
		initSphere();
		initShaderBuffers();
	}

	// 公共方法 - 设置光源位置
	this.setLightPosition = function( x, y, z, w ){
		vec4.set( this.lightPosition, x, y, z, w );
		// 更新界面控件
		if( document.getElementById( "lightX" ) ){
			document.getElementById( "lightX" ).value = x;
			document.getElementById( "lightY" ).value = y;
			document.getElementById( "lightZ" ).value = z;
			document.getElementById( "lightW" ).value = w;
		}
	}

	// 公共方法 - 设置材质属性
	this.setMaterialProperties = function( ar, ag, ab, dr, dg, db, sr, sg, sb, shininess ){
		vec4.set( this.materialAmbient, ar, ag, ab, 1.0 );
		vec4.set( this.materialDiffuse, dr, dg, db, 1.0 );
		vec4.set( this.materialSpecular, sr, sg, sb, 1.0 );
		this.materialShininess = shininess;
		// 更新界面控件
		if( document.getElementById( "ambientR" ) ){
			document.getElementById( "ambientR" ).value = ar;
			document.getElementById( "ambientG" ).value = ag;
			document.getElementById( "ambientB" ).value = ab;
			document.getElementById( "diffuseR" ).value = dr;
			document.getElementById( "diffuseG" ).value = dg;
			document.getElementById( "diffuseB" ).value = db;
			document.getElementById( "specularR" ).value = sr;
			document.getElementById( "specularG" ).value = sg;
			document.getElementById( "specularB" ).value = sb;
			document.getElementById( "shininess" ).value = shininess;
		}
	}

	// 私有方法 - 设置着色器
	function setupShaders(){
		// 创建着色器
		vertID = gl.createShader( gl.VERTEX_SHADER );
		fragID = gl.createShader( gl.FRAGMENT_SHADER );

		// 指定着色器源码
		gl.shaderSource( vertID, vertSrc );
		gl.shaderSource( fragID, fragSrc );

		// 编译着色器
		gl.compileShader( vertID );
		gl.compileShader( fragID );

		var error = false;
		if( !gl.getShaderParameter( vertID, gl.COMPILE_STATUS ) ){
			console.error( "Vertex shader error: " + gl.getShaderInfoLog( vertID ) );
			error = true;
		}

		if( !gl.getShaderParameter( fragID, gl.COMPILE_STATUS ) ){
			console.error( "Fragment shader error: " + gl.getShaderInfoLog( fragID ) );
			error = true;
		}

		if( error ) return;

		// 创建程序并附加着色器
		progID = gl.createProgram();
		gl.attachShader( progID, vertID );
		gl.attachShader( progID, fragID );

		// 链接程序
		gl.linkProgram( progID );
		if( !gl.getProgramParameter( progID, gl.LINK_STATUS ) ){
			console.error( gl.getProgramInfoLog( progID ) );
			return;
		}

		// 获取顶点着色器中in变量的位置
		vertexLoc = gl.getAttribLocation( progID, "vPosition" );
		normalLoc = gl.getAttribLocation( progID, "vNormal" );

		// 获取着色器中uniform变量的位置
		ambientProdLoc = gl.getUniformLocation( progID, "ambientProduct" );
		diffuseProdLoc = gl.getUniformLocation( progID, "diffuseProduct" );
		specularProdLoc = gl.getUniformLocation( progID, "specularProduct" );

		modelViewMatrixLoc = gl.getUniformLocation( progID, "modelViewMatrix" );
		projectionMatrixLoc = gl.getUniformLocation( progID, "projectionMatrix" );
		normalMatrixLoc = gl.getUniformLocation( progID, "normalMatrix" );

		lightPositionLoc = gl.getUniformLocation( progID, "lightPosition" );
		shininessLoc = gl.getUniformLocation( progID, "shininess" );
	}

	this.handleKeyDown = function(event){
		var key = event.keyCode;
		currentKey[ key ] = true;
		switch( key ){
			case 65: // a - 增加theta
				theta += stept;
				break;
			case 68: // d - 减少theta
				theta -= stept;
				break;
			case 87: // w - 增加phi
				phi += stept;
				break;
			case 83: // s - 减少phi
				phi -= stept;
				break;
			case 90: // z - 增大半径
				radius += stepm;
				break;
			case 88: // x - 减小半径
				radius -= stepm;
				break;
			case 86: // v - 增加细分级别
				this.setSubdivisions( numOfSubdivides + 1 );
				break;
			case 66: // b - 减少细分级别
				if( numOfSubdivides > 0 ){
					this.setSubdivisions( numOfSubdivides - 1 );
				}
				break;
		}
	}

	this.handleKeyUp = function(event){
		currentKey[ event.keyCode ] = false;
	}
}