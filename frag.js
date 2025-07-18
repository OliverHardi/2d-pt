const fragShaderSrc = /*glsl*/`#version 300 es
    
precision mediump float;

#define TAU 6.283185307179586

uniform vec2 uResolution;
uniform float uFrame;
uniform int uNumCircles;

uniform sampler2D uCircles;
uniform sampler2D uLastFrame;

out vec4 fragColor;

struct Circle{
    vec2 pos;
    float radius;
    vec3 albedo;
    float alpha;
    vec3 emission;
    float ior;
};

struct Intersection{
    bool hit;
    vec2 p;
    vec2 n;
    int i;
};

// inigo quilez hash
uint hash21( uvec2 p ){
    p *= uvec2(73333,7777);
    p ^= (uvec2(3333777777)>>(p>>28));
    uint n = p.x*p.y;
    return n^(n>>15);
}
float hash( uvec2 p ){
    uint h = hash21( p );
    return float(h)*(1.0/float(0xffffffffU));
}



Circle getCircle(int i){
    Circle circle;

    vec4 data1 = texelFetch(uCircles, ivec2(0, i), 0);
    vec4 data2 = texelFetch(uCircles, ivec2(1, i), 0);
    vec4 data3 = texelFetch(uCircles, ivec2(2, i), 0);

    circle.pos = data1.xy;
    circle.radius = data1.z;
    circle.albedo = data2.xyz;
    circle.alpha = data2.w;
    circle.emission = data3.xyz;
    circle.ior = data3.w;

    return circle;
}

float intersectCircle(vec2 o, vec2 d, vec2 center, float radius){
    vec2 oc = o - center;
    float b = dot(oc, d);
    float c = dot(oc, oc) - radius * radius;
    float h = b * b - c;
    if (h < 0.0) return 1e10;

    float sqrtH = sqrt(h);
    float t1 = -b - sqrtH;
    float t2 = -b + sqrtH;

    if(t1 > 0.0){ return t1; }
    if(t2 > 0.0){ return t2; }
    return 1e10;
}

Intersection intersectScene(vec2 ro, vec2 rd){
    float t = 1e10;
    vec2 n = vec2(0.);
    int c = 0;
    for(int i = 0; i < uNumCircles; i++){
        Circle circle = getCircle(i);
        float dist = intersectCircle(ro, rd, circle.pos, circle.radius);
        if(dist < t){
            t = dist;
            n = (ro + rd * dist) - circle.pos;
            c = i;
        }
    }
    Intersection intersection;
    intersection.hit = t < 10.;
    intersection.p = ro + rd * t;
    intersection.n = normalize(n);
    intersection.i = c;
    return intersection;
}

float fresnel(float costheta, float eta){
    float c = abs(costheta);
    float g = eta * eta - 1. + c * c;
    if(g > 0.){
        g = sqrt(g);
        float A = (g - c) / (g + c);
        float B = (c * (g + c) - 1.) / (c * (g - c) + 1.);
        return 0.5 * A * A * (1. + B * B);
    }else{
        return 1.;
    }
}

vec2 lambert(vec2 n, vec2 Xi){
    vec2 p = n + vec2(sin(Xi.x * TAU), cos(Xi.y * TAU));
    return normalize(p);
}



void main(){
    uvec2 seed = uvec2(gl_FragCoord.xy + mod(uFrame * vec2(913.27, 719.92), 9382.239));

    vec2 g = gl_FragCoord.xy + (vec2(hash(seed+uvec2(9, 13)), hash(seed+uvec2(13,9)))-0.5);
    vec2 p = g/uResolution * vec2(uResolution.x/uResolution.y, 1.);
    fragColor = vec4(vec3(0.), 1.);

    vec2 ro = p;

    float d = TAU * hash(seed + uvec2(17, 6));
    vec2 rd = vec2( cos(d), sin(d) );
    // rd = normalize( vec2(cos(uFrame*0.002), sin(uFrame*0.002)) );

    vec3 radiance = vec3(0.);
    vec3 throughput = vec3(1.);

    for(int i = 0; i < 24; i++){
        Intersection intersection = intersectScene(ro, rd);
        if(!intersection.hit){
            radiance += throughput * vec3(0.);
            break;
        }
        Circle circle = getCircle(intersection.i);
        
        vec2 wo = vec2(0.);

        float distToOutside = distance(ro, circle.pos)-circle.radius;
        bool isInside =  distToOutside < 0.;

        vec2 normal = isInside ? -intersection.n : intersection.n;

        float isTransmission = 1.;

        float rayIOR = isInside ? circle.ior : 1.;
        float circleIOR = isInside ? 1. : circle.ior;
        float eta = rayIOR/circleIOR;

        float costheta = dot(rd, normal);
        float fresnel = fresnel(costheta, 1./eta);

        bool isSpecular = false;

        float sintheta = sqrt( 1. - costheta*costheta );

        if( (hash(seed + uvec2(11, 7)) < fresnel) || (sintheta*eta) > 1.){        // specular
            wo = reflect(rd, normal);
            isSpecular = true;
        }else{

            if(hash(seed + uvec2(3, 0)) > circle.alpha){                          // transmission
                wo = refract(rd, normal, eta);
                isTransmission = -1.;
            }else{                                                                // lambert  
                vec2 Xi = vec2(hash(seed+uvec2(4, 34)), hash(seed+uvec2(38, 7)));
                wo = lambert(normal, Xi);
            }
        }
        

        radiance += throughput * circle.emission;
        throughput *= (!isSpecular && !(isTransmission == -1. && !isInside)) ? circle.albedo : vec3(1.);
        if(dot(throughput, throughput) < 1e-4){ break; }


        ro = intersection.p + normal * 1e-4 * isTransmission;
        rd = wo;
        seed += uvec2(15, 27);
    }

    vec3 lastFrame = texture(uLastFrame, gl_FragCoord.xy/uResolution).rgb;
    fragColor.rgb = (radiance + lastFrame*uFrame)/(uFrame+1.);
}

`;


const postShaderSrc = /*glsl*/`#version 300 es
precision mediump float;
out vec4 fragColor;
uniform vec2 uResolution;
uniform sampler2D uTex;

float luminance(vec3 x){
    return dot(x, vec3(0.2126, 0.7152, 0.0722));
}

vec3 aces(vec3 x){
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float dither4x4(vec2 position, float brightness) {
    int x = int(mod(position.x, 4.0));
    int y = int(mod(position.y, 4.0));
    int index = x + y * 4;
    float limit = 0.0;
  
    if(x < 8){
        if (index == 0) limit = 0.0625;
        if (index == 1) limit = 0.5625;
        if (index == 2) limit = 0.1875;
        if (index == 3) limit = 0.6875;
        if (index == 4) limit = 0.8125;
        if (index == 5) limit = 0.3125;
        if (index == 6) limit = 0.9375;
        if (index == 7) limit = 0.4375;
        if (index == 8) limit = 0.25;
        if (index == 9) limit = 0.75;
        if (index == 10) limit = 0.125;
        if (index == 11) limit = 0.625;
        if (index == 12) limit = 1.0;
        if (index == 13) limit = 0.5;
        if (index == 14) limit = 0.875;
        if (index == 15) limit = 0.375;
    }
  
    return brightness < limit ? 0. : 1.;
}
  
vec3 dither4x4(vec2 position, vec3 color) {
    return color * dither4x4(position, luminance(color));
}

void main(){
    vec3 col = texture(uTex, gl_FragCoord.xy/uResolution).rgb;

    col = aces(col);

    // col = dither4x4(gl_FragCoord.xy, pow(col, vec3(1./1.9)));

    col = pow(col, vec3(1./2.2));

    fragColor = vec4(col, 1.);
}

`