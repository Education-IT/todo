
function main() {

  var CANVAS = document.getElementById("your_canvas");

  CANVAS.width = CANVAS.height = Math.min(window.innerWidth, window.innerHeight);
  var GL = CANVAS.getContext("webgl", {antialias: false, alpha: false});

  var POINTER_X = 0.5, POINTER_Y = 0.5;

  var mouseMove = function(event) {
    POINTER_X = (event.clientX - CANVAS.offsetLeft) / CANVAS.width;
    POINTER_Y = 1 - event.clientY/CANVAS.height;
  };
  CANVAS.addEventListener("mousemove", mouseMove, false);
  SOURCEFLOW = 0;
  CANVAS.addEventListener("mouseout", function() { SOURCEFLOW = 0; } , false);


  CANVAS.addEventListener("mouseenter", function() { SOURCEFLOW = 4; } , false);

  // enable floating point precision textures:
  var EXT_FLOAT = GL.getExtension('OES_texture_float');

  /*========================= PARAMETERS ========================= */

  var SIMUSIZEPX = 512; // GPGPU simulation texture size in pixel
  var SIMUWIDTH = 2;    // Simulation size in meters
  var GPGPU_NPASS = 6; // number of GPGPU pass per rendering
  var WATER_DEPTH = 0.03;          // mean height of water in meters
  var RENDERING_FLOOR_SIZE = 0.5; // size of the water floor texture in meters

  /*========================= RENDERING SHADERS ========================= */
  /*jshint multistr: true */
  var vertSrc_render="\n\
attribute vec2 position;\n\
\n\
varying vec2 vUV;\n\
\n\
void main(void) {\n\
gl_Position = vec4(position, 0., 1.);\n\
vUV = 0.5 * (position + vec2(1.));\n\
}";


  var fragSrc_render = "\n\
precision highp float;\n\
\n\
uniform float H; // water depth (meters)\n\
uniform float L; // simulation size (meters)\n\
uniform float l; // ground texture tile size (meters)\n\
uniform sampler2D sampler;\n\
uniform sampler2D sampler_normals;\n\
\n\
varying vec2 vUV;\n\
\n\
void main(void) {\n\
vec4 textureColor = texture2D(sampler, vUV);\n\
vec4 water = texture2D(sampler_normals, vUV);\n\
vec3 water_normal = water.rgb + vec3(0., 0., 1.);\n\
float water_height = water.a;\n\
\n\
gl_FragColor = vec4(water_height+0.5, 0.,0.,1.);\n\
}";

  /*================= SHALLOW WATER EQUATION SHADERS ================== */

  var fragSrc_water = "\n\
precision highp float;\n\
\n\
uniform float dt, H, b, g, epsilon;\n\
uniform float scale;\n\
uniform vec2 mouse;\n\
\n\
uniform float sourceRadius, sourceFlow;\n\
uniform sampler2D sampler_water, sampler_normals;\n\
\n\
varying vec2 vUV;\n\
\n\
void main(void) {\n\
\n\
vec4 water_t  = texture2D(sampler_water, vUV);\n\
float h       = water_t.r;\n\
vec2 uvSpeed  = water_t.gb;\n\
\n\
vec2 dx = vec2(epsilon, 0.);\n\
vec2 dy = vec2(0., epsilon);\n\
float du_dx = (texture2D(sampler_water, vUV+dx).g - texture2D(sampler_water, vUV-dx).g)/(2.*scale);\n\
float dv_dy = (texture2D(sampler_water, vUV+dy).b - texture2D(sampler_water, vUV-dy).b)/(2.*scale);\n\
\n\
vec3 normals = texture2D(sampler_normals,vUV).xyz;\n\
\n\
// we add 1 to Nz because RGB = (0,0,0) -> Normal = (0,0,1)\n\
vec2 d_uvSpeed = -dt * (g * normals.xy/(normals.z+1.) + b*uvSpeed);\n\
\n\
float d_h = -dt * H * (du_dx + dv_dy);\n\
\n\
float dSource = length(vUV-mouse);\n\
\n\
d_h += dt * sourceFlow * (1. - smoothstep(0., sourceRadius, dSource));\n\
gl_FragColor = vec4(h + d_h, uvSpeed + d_uvSpeed, 1.);\n\
}";

  /*================= TEXTURE COPY SHADERS ================== */

  var fragSrc_copy = "\n\
precision highp float;\n\
\n\
uniform float scale;\n\
uniform sampler2D sampler;\n\
\n\
varying vec2 vUV;\n\
\n\
void main(void) {\n\
float dxy = 1. / scale;\n\
vec4 waterData = texture2D(sampler, vUV);\n\
vec4 waterDataAvg = (texture2D(sampler, vUV+vec2(dxy,0.))\n\
+.5*texture2D(sampler, vUV+vec2(dxy,dxy))\n\
+texture2D(sampler, vUV+vec2(0.,dxy))\n\
+.5*texture2D(sampler, vUV+vec2(-dxy,dxy))\n\
+texture2D(sampler, vUV+vec2(-dxy,0.))\n\
+.5*texture2D(sampler, vUV+vec2(-dxy,-dxy))\n\
+texture2D(sampler, vUV+vec2(0.,-dxy))\n\
+.5*texture2D(sampler, vUV+vec2(dxy,-dxy)))/6.;\n\
\n\
gl_FragColor = mix(waterData, waterDataAvg, 0.3);\n\
}";

  /*================= NORMALS SHADERS ================== */

  var fragSrc_normals = "\n\
precision highp float;\n\
\n\
uniform sampler2D sampler;\n\
uniform float epsilon, scale; // horizontal scale in meters\n\
varying vec2 vUV;\n\
\n\
vec3 getPoint(float x, float y, vec2 uv){\n\
float h = texture2D(sampler, uv+vec2(x,y)).r; // water height\n\
return vec3(x*scale,y*scale,h);\n\
}\n\
\n\
void main(void) {\n\
vec3 points[4];\n\
points[0] = getPoint(-epsilon,0., vUV);\n\
points[1] = getPoint(0.,-epsilon, vUV);\n\
points[2] = getPoint(epsilon ,0., vUV);\n\
points[3] = getPoint(0. ,epsilon, vUV);\n\
\n\
vec3 normal = normalize(cross(points[1]-points[3], points[2]-points[0]));\n\
\n\
// We substract 1 to Nz because Normal = (0,0,1) -> RGB = (0,0,0)\n\
normal.z -= 1.;\n\
\n\
float height = texture2D(sampler, vUV).r;\n\
gl_FragColor = vec4(normal, height);\n\
}";

  // compile a shader:
  var compile_shader = function(source, type, typeString) {
    var shader = GL.createShader(type);
    GL.shaderSource(shader, source);
    GL.compileShader(shader);
    if (!GL.getShaderParameter(shader, GL.COMPILE_STATUS)) {
      alert("ERROR IN " + typeString + " SHADER: " + GL.getShaderInfoLog(shader));
      return false;
    }
    return shader;
  };

  // build a shader program:
  var compile_shaderProgram = function(vertex_source, fragment_source, typeStr){
    var shader_vertex = compile_shader(vertex_source, GL.VERTEX_SHADER, typeStr + " VERTEX");
    var shader_fragment = compile_shader(fragment_source, GL.FRAGMENT_SHADER, typeStr + " FRAGMENT");

    var shader_program = GL.createProgram();
    GL.attachShader(shader_program, shader_vertex);
    GL.attachShader(shader_program, shader_fragment);

    GL.linkProgram(shader_program);
    return shader_program;
  };


  // final rendering shader program:
  var SHP_VARS = {};
  var SHP_RENDERING = compile_shaderProgram(vertSrc_render, fragSrc_render, "RENDER");

  SHP_VARS.rendering = {
    H: GL.getUniformLocation(SHP_RENDERING, "H"),
    L: GL.getUniformLocation(SHP_RENDERING, "L"),
    l: GL.getUniformLocation(SHP_RENDERING, "l"),
    sampler: GL.getUniformLocation(SHP_RENDERING, "sampler"),
    sampler_normals: GL.getUniformLocation(SHP_RENDERING, "sampler_normals"),
    position: GL.getAttribLocation(SHP_RENDERING, "position")
  };
  var SHP_WATER = compile_shaderProgram(vertSrc_render, fragSrc_water, "WATER");

  SHP_VARS.water = {
    dt: GL.getUniformLocation(SHP_WATER, "dt"),
    H: GL.getUniformLocation(SHP_WATER, "H"),
    b: GL.getUniformLocation(SHP_WATER, "b"),
    g: GL.getUniformLocation(SHP_WATER, "g"),
    mouse: GL.getUniformLocation(SHP_WATER, "mouse"),
    sourceFlow: GL.getUniformLocation(SHP_WATER, "sourceFlow"),
    sourceRadius: GL.getUniformLocation(SHP_WATER, "sourceRadius"),

    epsilon: GL.getUniformLocation(SHP_WATER, "epsilon"),
    scale: GL.getUniformLocation(SHP_WATER, "scale"),

    sampler_water: GL.getUniformLocation(SHP_WATER, "sampler_water"),
    sampler_normals: GL.getUniformLocation(SHP_WATER, "sampler_normals"),

    position: GL.getAttribLocation(SHP_WATER, "position")
  };

  var SHP_COPY = compile_shaderProgram(vertSrc_render, fragSrc_copy, "COPY");

  SHP_VARS.copy = {
    scale: GL.getUniformLocation(SHP_COPY, "scale"),
    sampler: GL.getUniformLocation(SHP_COPY, "sampler"),
    position: GL.getAttribLocation(SHP_COPY, "position")
  };
  var SHP_NORMALS=compile_shaderProgram(vertSrc_render, fragSrc_normals, "NORMALS");

  SHP_VARS.normals={
    sampler: GL.getUniformLocation(SHP_NORMALS, "sampler"),
    scale: GL.getUniformLocation(SHP_NORMALS, "scale"),
    epsilon: GL.getUniformLocation(SHP_NORMALS, "epsilon"),
    position: GL.getAttribLocation(SHP_NORMALS, "position")
  };


  /*========================= THE QUAD ========================= */
  // POINTS:
  var quad_vertex = [
    -1,-1, // first corner: -> bottom left of the viewport
    1,-1,  // bottom right
    1,1,   // top right
    -1,1   // top left
  ];

  var QUAD_VERTEX = GL.createBuffer ();
  GL.bindBuffer(GL.ARRAY_BUFFER, QUAD_VERTEX);
  GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(quad_vertex), GL.STATIC_DRAW);

  // FACES:
  var quad_faces = [0,1,2, 0,2,3];
  var QUAD_FACES = GL.createBuffer ();
  GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, QUAD_FACES);
  GL.bufferData(GL.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2, 0,2,3]), GL.STATIC_DRAW);


  /*========================= THE TEXTURE ========================= */

  var renderingImage = new Image();
  renderingImage.src = 'waterFloor.jpg';
  var renderingTexture = GL.createTexture();
  GL.pixelStorei(GL.UNPACK_FLIP_Y_WEBGL, true);
  GL.bindTexture(GL.TEXTURE_2D, renderingTexture);

  renderingImage.onload = function() {
    GL.bindTexture(GL.TEXTURE_2D, renderingTexture);
    GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.LINEAR);
    GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR);
    GL.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, GL.RGBA, GL.UNSIGNED_BYTE, renderingImage);
  };

  /*====================== RENDER TO TEXTURE ====================== */

  // OFFSCREEN FRAMEBUFFER FOR RTT:
  var rtt_fb = GL.createFramebuffer();

  // GPGPU WATER TEXTURE:
  function create_dataTexture(){
    var glTex = GL.createTexture();
    GL.bindTexture(GL.TEXTURE_2D, glTex);
    GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
    GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
    GL.texParameteri( GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE );
    GL.texParameteri( GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE );
    GL.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, SIMUSIZEPX, SIMUSIZEPX, 0, GL.RGBA, GL.FLOAT, null);
    return glTex;
  }
  var texture_water = create_dataTexture();
  var texture_water2 = create_dataTexture();
  var textures_waterPingPong = [texture_water, texture_water2];

  // NORMALS RTT:
  var texture_normals = create_dataTexture();


  /*========================= INIT ========================= */

  // WEBGL GENERAL INIT:
  GL.disable(GL.DEPTH_TEST);
  GL.disable(GL.SCISSOR_TEST);
  GL.clearColor(0.0, 0.0, 0.0, 0.0);

  // SHADER PROGRAM RENDERING INIT:
  GL.useProgram(SHP_RENDERING);
  GL.enableVertexAttribArray(SHP_VARS.rendering.position);
  GL.uniform1f(SHP_VARS.rendering.H, WATER_DEPTH);
  GL.uniform1f(SHP_VARS.rendering.L, SIMUWIDTH);
  GL.uniform1f(SHP_VARS.rendering.l, RENDERING_FLOOR_SIZE);
  GL.uniform1i(SHP_VARS.rendering.sampler, 0);
  GL.uniform1i(SHP_VARS.rendering.sampler_normals, 1);
  GL.bindBuffer(GL.ARRAY_BUFFER, QUAD_VERTEX);
  GL.vertexAttribPointer(SHP_VARS.rendering.position, 2, GL.FLOAT, false, 8, 0);
  GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, QUAD_FACES);
  GL.disableVertexAttribArray(SHP_VARS.rendering.position);


  // SHADER PROGRAM GPGPU WATER INIT:
  GL.useProgram(SHP_WATER);
  GL.uniform1i(SHP_VARS.water.sampler_water, 0);
  GL.uniform1i(SHP_VARS.water.sampler_normals, 1);

  // WE SIMULATE A SQUARE WATER SURFACE SIDE MEASURING 2 METERS:
  GL.uniform1f(SHP_VARS.water.g, -9.8);       // gravity acceleration
  GL.uniform1f(SHP_VARS.water.H, WATER_DEPTH);  // mean height of water in meters
  GL.uniform1f(SHP_VARS.water.b, 0.001);       // viscous drag coefficient
  GL.uniform1f(SHP_VARS.water.epsilon, 1/SIMUSIZEPX); // used to compute space derivatives
  GL.uniform1f(SHP_VARS.water.scale, SIMUWIDTH/SIMUSIZEPX);

  GL.uniform1f(SHP_VARS.water.sourceRadius, 0.04); // percentage of the surface which is flowed by the source

  GL.enableVertexAttribArray(SHP_VARS.water.position);
  GL.bindBuffer(GL.ARRAY_BUFFER, QUAD_VERTEX);
  GL.vertexAttribPointer(SHP_VARS.water.position, 2, GL.FLOAT, false, 8, 0);
  GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, QUAD_FACES);
  GL.disableVertexAttribArray(SHP_VARS.water.position);


  // SHADER PROGRAM TEXTURE COPY INIT
  GL.useProgram(SHP_COPY);
  GL.uniform1f(SHP_VARS.copy.scale, SIMUSIZEPX);
  GL.uniform1i(SHP_VARS.copy.sampler, 0);
  GL.enableVertexAttribArray(SHP_VARS.copy.position);
  GL.bindBuffer(GL.ARRAY_BUFFER, QUAD_VERTEX);
  GL.vertexAttribPointer(SHP_VARS.copy.position, 2, GL.FLOAT, false, 8, 0);
  GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, QUAD_FACES);
  GL.disableVertexAttribArray(SHP_VARS.copy.position);


  // SHADER PROGRAM NORMALS INIT
  GL.useProgram(SHP_NORMALS);
  GL.uniform1i(SHP_VARS.normals.sampler, 0);
  GL.uniform1f(SHP_VARS.normals.epsilon, 1/SIMUSIZEPX); // used to compute space derivatives
  GL.uniform1f(SHP_VARS.normals.scale, SIMUWIDTH);

  GL.enableVertexAttribArray(SHP_VARS.normals.position);
  GL.bindBuffer(GL.ARRAY_BUFFER, QUAD_VERTEX);
  GL.vertexAttribPointer(SHP_VARS.normals.position, 2, GL.FLOAT, false, 8, 0);
  GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, QUAD_FACES);
  GL.disableVertexAttribArray(SHP_VARS.normals.position);

  /*========================= RENDER LOOP ========================= */
  var timestamp_prev = 0;
  var animate = function(timestamp) {
    var dt = (timestamp - timestamp_prev) / 1000; // time step in seconds;
    dt = Math.min(Math.abs(dt), 0.017);
    timestamp_prev = timestamp;

    GL.clear(GL.COLOR_BUFFER_BIT);
    GL.bindFramebuffer(GL.FRAMEBUFFER, rtt_fb);
    GL.viewport(0, 0, SIMUSIZEPX, SIMUSIZEPX);


    for (var i=0; i<GPGPU_NPASS; i++) {

      // COPY
      GL.framebufferTexture2D(
        GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, textures_waterPingPong[1], 0);
      GL.useProgram(SHP_COPY);
      GL.enableVertexAttribArray(SHP_VARS.copy.position);
      GL.bindTexture(GL.TEXTURE_2D, textures_waterPingPong[0]);
      GL.drawElements(GL.TRIANGLES, 6, GL.UNSIGNED_SHORT, 0);
      GL.disableVertexAttribArray(SHP_VARS.copy.position);
      textures_waterPingPong.reverse();

      // GPGPU PHYSICAL SIMULATION:
      GL.framebufferTexture2D(
        GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, textures_waterPingPong[1], 0);

      GL.useProgram(SHP_WATER);
      GL.enableVertexAttribArray(SHP_VARS.water.position);
      GL.activeTexture(GL.TEXTURE1);
      GL.bindTexture(GL.TEXTURE_2D, texture_normals);
      GL.activeTexture(GL.TEXTURE0);
      GL.bindTexture(GL.TEXTURE_2D, textures_waterPingPong[0]);
      if (!i) {
        GL.uniform2f(SHP_VARS.water.mouse, POINTER_X, POINTER_Y);
        GL.uniform1f(SHP_VARS.water.sourceFlow, SOURCEFLOW);
        GL.uniform1f(SHP_VARS.water.dt, dt/GPGPU_NPASS);
      }
      GL.drawElements(GL.TRIANGLES, 6, GL.UNSIGNED_SHORT, 0);
      GL.disableVertexAttribArray(SHP_VARS.water.position);

      textures_waterPingPong.reverse();

      // NORMALS:
      GL.framebufferTexture2D(
        GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, texture_normals, 0);
      GL.useProgram(SHP_NORMALS);
      GL.enableVertexAttribArray(SHP_VARS.normals.position);
      GL.bindTexture(GL.TEXTURE_2D, textures_waterPingPong[0]);
      GL.drawElements(GL.TRIANGLES, 6, GL.UNSIGNED_SHORT, 0);
      GL.disableVertexAttribArray(SHP_VARS.normals.position);

    } // end for GPGPU_NPASS


    // RENDERING:
    GL.bindFramebuffer(GL.FRAMEBUFFER, null);
    GL.useProgram(SHP_RENDERING);
    GL.enableVertexAttribArray(SHP_VARS.rendering.position);
    GL.viewport(0, 0, CANVAS.width, CANVAS.height);
    GL.activeTexture(GL.TEXTURE1);
    GL.bindTexture(GL.TEXTURE_2D, texture_normals);
    GL.activeTexture(GL.TEXTURE0);
    GL.bindTexture(GL.TEXTURE_2D, renderingTexture);
    GL.drawElements(GL.TRIANGLES, 6, GL.UNSIGNED_SHORT, 0);
    GL.disableVertexAttribArray(SHP_VARS.rendering.position);

    GL.flush();
    window.requestAnimationFrame(animate);
  };

  animate(Date.now());
}

window.addEventListener('load', main);
