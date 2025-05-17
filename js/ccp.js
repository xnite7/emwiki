//---
const file = "https://i.imgur.com/9ZX44sI.png";

  const imageSrc = new Image();
  imageSrc.crossOrigin = "Anonymous"; // Allow cross-origin image loading
  imageSrc.src = file;



//---

const capturer = new CCapture( { format: 'png', framerate: 60, verbose: true } );


//---

let w = 1024;
let h = 1024;

//---

const center = { x: w / 2, y: h / 2 };
const border = { left: 1, top: 1, right: w, bottom: h };

//---

let mouseActive = false;
let mouseDown = false;
let mousePos = { x: center.x, y: center.y };

let pointUnderMouse = null;

//---

let animationFrame = null;

//---

let canvas = null;
let gl = null;

//let canvasDebug = null;
//let contextDebug = null;
//let imageDebug = null;
//let dataDebug = null;

let canvasSrc = null;
let contextSrc = null;
let imageDataSrc = null;
let dataSrc = null;

//---

let gridWidth = 50;
let gridHeight = 50;
let gridDistanceX = 4;
let gridDistanceY = 4;
let gridWobbleFactor = 0.71;
let gridWobbleSpeed = 0.05;

let model = {};

//---

function init() {
  canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.addEventListener('mousedown', mouseDownHandler, false);
  canvas.addEventListener('touchstart', mouseDownHandler, false);

  canvas.addEventListener('mouseup', mouseUpHandler, false);
  canvas.addEventListener('touchend', mouseUpHandler, false);
 

  canvas.addEventListener('mousemove', mouseMoveHandler, false);
  canvas.addEventListener('touchmove', mouseMoveHandler, false);

  canvas.addEventListener('mouseenter', mouseEnterHandler, false);
  canvas.addEventListener('mouseleave', mouseLeaveHandler, false);

  canvas.addEventListener('touchcancel', mouseLeaveHandler, false);

  gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  gl.enable(gl.DEPTH_TEST);

  document.body.appendChild(canvas);

  const file = "https://i.imgur.com/9ZX44sI.jpeg";
  const imageSrc = new Image();
  imageSrc.crossOrigin = "Anonymous"; // Allow cross-origin image loading
  imageSrc.src = file;


  imageSrc.onload = function () {
    imageSrc.width = imageSrc.width;
    imageSrc.height = imageSrc.height;
    canvasSrc = document.createElement('canvas');
    canvasSrc.width = imageSrc.width;
    canvasSrc.height = imageSrc.height;

    contextSrc = canvasSrc.getContext('2d');
    contextSrc.drawImage(imageSrc, 0, 0);



    imageDataSrc = contextSrc.getImageData(0, 0, imageSrc.width, imageSrc.height);
    dataSrc = imageDataSrc.data;

    console.log("Image loaded successfully. Starting the application...");
    restart(); // Call restart only after the image is loaded
  };

  imageSrc.onerror = function () {
    console.error("Failed to load the image.");
  };

  window.addEventListener('resize', onResize, false);
}

//---

function onResize( event ) {
    
  restart();

}

function restart() {

	w = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
  h = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;

  canvas.width = w;
  canvas.height = h;
  
  //canvasDebug.width = w;
  //canvasDebug.height = h;
  
  //imageDataDebug = contextDebug.getImageData( 0, 0, w, h );
  //dataDebug = imageDataDebug.data;
  
  //---
  
  model = buildModel();

  //---
  
  center.x = w/2;
  center.y = h/2;
  
  mousePos.x = center.x;
  mousePos.y = center.y;
  
  border.right = w;
  border.bottom = h;
  
  //---
  
  gl.viewport( 0, 0, w, h );
  
  //---
  
  updateVertecis();
  
  //---
  
  if ( animationFrame != null ) {
  
  	cancelAnimFrame( animationFrame );
  
  }
 	
	animationFrame = requestAnimFrame( render );

}

//---

function buildModel() {

	const model = calcOBJ();
  
  const vertexCode = `
	attribute vec4 color;
  attribute vec3 a_position;

	uniform vec2 u_resolution;
  
  varying vec4 vColor;
  
  void main(void) {
  
  	vColor = color;

    vec2 pos2d = a_position.xy;
    
    vec2 zeroToOne = pos2d / u_resolution;
		vec2 zeroToTwo = zeroToOne * 2.0;

		vec2 clipSpace = zeroToTwo - 1.0;

		gl_Position = vec4(clipSpace * vec2(1, -1), a_position.z, 1);

  }
  `

	const fragmentCode = `
  //precision mediump float;
  precision lowp float;
  
  varying vec4 vColor;
  
  void main(void) {
  
    gl_FragColor = vColor;
    //gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);

  }
  `

  const vertShader = createShader( gl, vertexCode, gl.VERTEX_SHADER );
  const fragShader = createShader( gl, fragmentCode, gl.FRAGMENT_SHADER );

  model.shaderProgram = createShaderProgram( gl, vertShader, fragShader );
  
  //---
  
  model.buffers.positionBuffer = createBuffer( gl, gl.ARRAY_BUFFER, model.vertices, gl.STATIC_DRAW );
  model.buffers.colorBuffer = createBuffer( gl, gl.ARRAY_BUFFER, new Float32Array( model.colors ), gl.STATIC_DRAW );
  model.buffers.indexBuffer = createBuffer( gl, gl.ELEMENT_ARRAY_BUFFER, new Uint16Array( model.faces ), gl.STATIC_DRAW );

	model.locations.resolution = gl.getUniformLocation( model.shaderProgram, 'u_resolution' );
  model.locations.position = gl.getAttribLocation( model.shaderProgram, 'a_position' );
  model.locations.color = gl.getAttribLocation( model.shaderProgram, 'color' );
  
  //---
  
  return model;

}

function calcOBJ() {
  
  let vertices = [];
  let faces = [];
  let colors = [];
  let buffers = {};
  let transforms = {};
  let locations = {};
  
  let verticesObjHolder = [];
  let verticesTemp = [];
  
  let index = 0;
  let gridHolder = [];
  
  //---
  //vertices 
  
  for ( let y = 0, yl = gridHeight; y < yl; y ++ ) {
  
  	const verticesRow = [];

  	for ( let x = 0, xl = gridWidth; x < xl; x ++ ) {

    	const vertex = {};

      vertex.index = verticesObjHolder.length;
      vertex.ix = x;
      vertex.iy = y;
      vertex.distance = 0;
      vertex.sx = 0;
      vertex.sy = 0;
      vertex.time = 0;
      
      vertex.position = { 
      
      	x: center.x - ( gridWidth * gridDistanceX ) / 2 + ( x * gridDistanceX ) + gridDistanceX / 2, 
        y: center.y - ( gridHeight * gridDistanceY ) / 2 + ( y * gridDistanceY ) + gridDistanceY / 2,
        z: 0
        
      };
      
      vertex.initPosition = { 
      
      	x: vertex.position.x,
        y: vertex.position.y,
        z: vertex.position.z
        
      };

      verticesRow.push( index++ );
      
  		verticesObjHolder.push( vertex );

  	}
    
    gridHolder.push( verticesRow );
  
  }
  
  //---
  //faces

  for ( let y = 0, yl = gridHeight - 1; y < yl; y ++ ) {

  	for ( let x = 0, xl = gridWidth - 1; x < xl; x ++ ) {
    
    	const a = gridHolder[ y ][ x + 1 ];
      const b = gridHolder[ y ][ x ];
      const c = gridHolder[ y + 1 ][ x ];
      const d = gridHolder[ y + 1 ][ x + 1 ];
      
      //console.log( a, b, c, ' - ', c, d, a, '\n');
      
      //---

      const vA0 = copyVertex( verticesObjHolder[ a ] );
      const vB0 = copyVertex( verticesObjHolder[ b ] );
      const vC0 = copyVertex( verticesObjHolder[ c ] );
      const vD0 = copyVertex( verticesObjHolder[ d ] );
      const vA1 = copyVertex( verticesObjHolder[ a ] );
      const vC1 = copyVertex( verticesObjHolder[ c ] );

      verticesTemp.push( vA0 );
      verticesTemp.push( vB0 );
      verticesTemp.push( vC0 );
      verticesTemp.push( vC1 );
      verticesTemp.push( vD0 );
      verticesTemp.push( vA1 );
      
      vA0.index = vertices.length;
      vertices.push( vA0.position.x, vA0.position.y, vA0.position.z );
      vB0.index = vertices.length;
      vertices.push( vB0.position.x, vB0.position.y, vB0.position.z );
      vC0.index = vertices.length;
      vertices.push( vC0.position.x, vC0.position.y, vC0.position.z );
			
      vC1.index = vertices.length;
      vertices.push( vC1.position.x, vC1.position.y, vC1.position.z );
      vD0.index = vertices.length;
      vertices.push( vD0.position.x, vD0.position.y, vD0.position.z );
      vA1.index = vertices.length;
      vertices.push( vA1.position.x, vA1.position.y, vA1.position.z );
      
      //---
      
      const index0 = faces.length;
      const index1 = faces.length + 3;
      
      faces.push( index0 );
      faces.push( index0 + 1 );
      faces.push( index0 + 2 );
      
      faces.push( index1 );
      faces.push( index1 + 1 );
      faces.push( index1 + 2 );
      
      //---
      
      const cpx = Math.floor( x / gridWidth * imageSrc.width );
      const cpy = Math.floor( y / gridHeight * imageSrc.height );
      
      const color0 = getPixel( cpx, cpy );
      const color1 = getPixel( cpx, cpy );

      color0.r = color0.r / 255;
      color0.g = color0.g / 255;
      color0.b = color0.b / 255;
      color0.a = color0.a / 255;
      
      color1.r = color1.r / 255;
      color1.g = color1.g / 255;
      color1.b = color1.b / 255;
      color1.a = color1.a / 255;

      colors.push( color0.r, color0.g, color0.b, color0.a );
      colors.push( color0.r, color0.g, color0.b, color0.a );
      colors.push( color0.r, color0.g, color0.b, color0.a );
      
      colors.push( color1.r, color1.g, color1.b, color1.a );
      colors.push( color1.r, color1.g, color1.b, color1.a );
      colors.push( color1.r, color1.g, color1.b, color1.a );

    }
    
  }

  verticesObjHolder = [ ...verticesTemp ];
  

  
  return { vertices: new Float32Array( vertices ), verticesLength: vertices.length / 3, colors: colors, faces: faces, facesCounter: faces.length, buffers: buffers, transforms: transforms, locations: locations, points: verticesObjHolder };

}

//---

function copyVertex( vertex ) {

	const v = {};
  
  v.index = vertex.index;
  v.ix = vertex.ix;
  v.iy = vertex.iy;
  v.distance = vertex.distance;
  v.sx = vertex.sx;
  v.sy = vertex.sy;
  v.time = vertex.time;

  v.position = { 

    x: vertex.position.x,
    y: vertex.position.y,
    z: vertex.position.z

  };

  v.initPosition = { 

    x: v.position.x,
    y: v.position.y,
    z: v.position.z

  };

	return v;

}

function updateVertecis() {

	for ( let i = 0, l = model.points.length; i < l; i++ ) {
  
  	const vertex = model.points[ i ];

    //vertex.distance = 0;
    vertex.sx = 0;
    vertex.sy = 0;
    vertex.time = 0;

    vertex.position = { 

      x: center.x - ( gridWidth * gridDistanceX ) / 2 + ( vertex.ix * gridDistanceX ) + gridDistanceX / 2, 
      y: center.y - ( gridHeight * gridDistanceY ) / 2 + ( vertex.iy * gridDistanceY ) + gridDistanceY / 2,
      z: 0

    };

    vertex.initPosition = { 

      x: vertex.position.x,
      y: vertex.position.y,
      z: vertex.position.z

    };
  
  }

}

//---

function getNearestPointToMouse( position ) {

	let d = w * h;
  let p = null;

	for ( let i = 0, l = model.points.length; i < l; i ++ ) {

  	const point = model.points[ i ];

    const dx = point.position.x - position.x;
    const dy = point.position.y - position.y;

    //point.distance = Math.sqrt( dx * dx + dy * dy );
    point.distance = dx * dx + dy * dy;
    
    point.position.z = point.distance / 10000000;

    if ( d > point.distance ) {

      p = point;

    }
    
    d = Math.min( point.distance, d );

  }
  
  return p;

}

//---

function animate() {
	
  gl.uniform2f( model.locations.resolution, w, h );
  
  gl.enableVertexAttribArray( model.locations.position );
  gl.bindBuffer( gl.ARRAY_BUFFER, model.buffers.positionBuffer );
  gl.vertexAttribPointer( model.locations.position, 3, gl.FLOAT, false, 0, 0 );
  
  
	if ( mouseDown === false ) {
  
  	pointUnderMouse = getNearestPointToMouse( mousePos );
  
  }

  if ( pointUnderMouse ) {

    //setPixel( pointUnderMouse.position.x | 0, pointUnderMouse.position.y | 0, 255, 255, 255, 255 );
    //drawCircle( pointUnderMouse.position, 2, 255, 255, 255, 255 );
    
    if ( mouseDown === true ) {

      const fpx = mousePos.x - ( pointUnderMouse.ix * gridDistanceX );
			const fpy = mousePos.y - ( pointUnderMouse.iy * gridDistanceY );

      for ( let i = 0, l = model.points.length; i < l; i ++ ) {

        const point = model.points[ i ];
        
        point.time = 150;

        let speedX = ( point.distance / gridWidth );
        let speedY = ( point.distance / gridHeight );
        
        if ( point.distance < 100 ) {
        
        	speedX = 1;
        
        }
        if ( point.distance < 100 ) {
        
        	speedY = 1;
        
        }

        point.position.x += ( ( fpx + ( point.ix * gridDistanceX ) ) - point.position.x ) / speedX;
        point.position.y += ( ( fpy + ( point.iy * gridDistanceY ) ) - point.position.y ) / speedY;

        model.vertices[ point.index + 0 ] = point.position.x;
  			model.vertices[ point.index + 1 ] = point.position.y;
        model.vertices[ point.index + 2 ] = point.position.z;
        
      }
      
    } else {

      for ( let i = 0, l = model.points.length; i < l; i ++ ) {

        const point = model.points[ i ];

        if ( point.time > 0 ) {
        
        	point.time--;

          point.sx = point.sx * gridWobbleFactor + ( point.initPosition.x - point.position.x ) * gridWobbleSpeed;
          point.sy = point.sy * gridWobbleFactor + ( point.initPosition.y - point.position.y ) * gridWobbleSpeed;

          point.position.x = point.position.x + point.sx;
          point.position.y = point.position.y + point.sy;
        
        } else {
        
        	point.sx = 0;
          point.sy = 0;
        
        	point.position.x = point.initPosition.x;
          point.position.y = point.initPosition.y;
        
        }
        
        model.vertices[ point.index + 0 ] = point.position.x;
  			model.vertices[ point.index + 1 ] = point.position.y;
        model.vertices[ point.index + 2 ] = point.position.z;

      }
    
    }

  }
	
  gl.bufferData( gl.ARRAY_BUFFER, model.vertices, gl.STATIC_DRAW );

  gl.enableVertexAttribArray( model.locations.color );
  gl.bindBuffer( gl.ARRAY_BUFFER, model.buffers.colorBuffer );
  gl.vertexAttribPointer( model.locations.color, 4, gl.FLOAT, false, 0, 0 );
  
  //---

  gl.drawElements( gl.TRIANGLES, model.facesCounter, gl.UNSIGNED_SHORT, 0 );

  //gl.drawArrays( gl.POINTS, 0, model.vertices.length / 3 );
  //gl.drawArrays( gl.POINTS, 0, 1000 );
  
  //---
  /*
  clearImageData();
  
  for ( let i = 0, l = model.points.length; i < l; i ++ ) {
  
  	const vertex = model.points[ i ];

  	//setPixel( vertex.position.x | 0, vertex.position.y | 0, 255, 255, 255, 255 );
  
  }
  
  contextDebug.putImageData( imageDataDebug, 0, 0 );
  */
  //---
  
  capturer.capture( canvas );
  
  //---
  

}

//---
/*
function clearImageData() {

  for ( let i = 0, l = dataDebug.length; i < l; i += 4 ) {

    dataDebug[ i ] = 0;
    dataDebug[ i + 1 ] = 0;
    dataDebug[ i + 2 ] = 0;
    dataDebug[ i + 3 ] = 0;

  }

}

function setPixel( x, y, r, g, b, a ) {

  const i = ( x + y * imageDataDebug.width ) * 4;

  dataDebug[ i ] = r;
  dataDebug[ i + 1 ] = g;
  dataDebug[ i + 2 ] = b;
  dataDebug[ i + 3 ] = a;

}
*/
function getPixel( x, y ) {

  //const i = ((y>>0) * imageDataSrc.width + (x>>0)) * 4;
  const i = ( x + y * imageDataSrc.width ) * 4;

  return { r: dataSrc[ i ],
           g: dataSrc[ i + 1 ],
           b: dataSrc[ i + 2 ],
           a: 255 };
           //a: dataSrc[ i + 3 ] };

}

//---

function mouseDownHandler( event ) {

  mouseDown = true;

}

function mouseUpHandler( event ) {

  mouseDown = false;

}

function mouseEnterHandler( event ) {

  mouseActive = true;

}

function mouseLeaveHandler( event ) {

  mouseActive = false;
  
  mouseDown = false;

}

function mouseMoveHandler( event ) {

  mousePos = getMousePos( canvas, event );

}

function getMousePos( canvas, event ) {

  const rect = canvas.getBoundingClientRect();

  return { x: event.clientX - rect.left, y: event.clientY - rect.top };

}

//---

function createBuffer( gl, target, bufferArray, usage ) {

	const buffer = gl.createBuffer();

  gl.bindBuffer( target, buffer );
  gl.bufferData( target, bufferArray, usage );

	return buffer;

}

//---

function createShader( gl, shaderCode, type ) {

	const shader = gl.createShader( type );

  gl.shaderSource( shader, shaderCode );
  gl.compileShader( shader );
  
  if ( !gl.getShaderParameter( shader, gl.COMPILE_STATUS ) ) {

    console.log( 'Could not compile WebGL program. \n\n' + gl.getShaderInfoLog( shader ) );
    
	}
  
	return shader;

}

//---

function createShaderProgram( gl, vertexShader, fragmentShader ) {

	const shaderProgram = gl.createProgram();

  gl.attachShader( shaderProgram, vertexShader );
  gl.attachShader( shaderProgram, fragmentShader );

  gl.linkProgram( shaderProgram );
  gl.useProgram( shaderProgram );
  
  if ( !gl.getProgramParameter( shaderProgram, gl.LINK_STATUS ) ) {

    console.log( 'Could not compile WebGL program. \n\n' + gl.getProgramInfoLog( shaderProgram ) );
    
	}

	return shaderProgram;

}

//---

function render( timestamp ) {

  animate();

  //---

  animationFrame = requestAnimFrame( render );

}

window.requestAnimFrame = ( function() {

    return  window.requestAnimationFrame       ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame    ||
            window.msRequestAnimationFrame     ||
            function( callback ) {
                window.setTimeout( callback, 1000 / 60 );
            };

} )();

window.cancelAnimFrame = ( function() {

    return  window.cancelAnimationFrame       ||
            window.mozCancelAnimationFrame;

} )();

//---

init();


//---