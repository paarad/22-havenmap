import assert from "node:assert";
import http from "node:http";

async function post(path, body){
	const data = JSON.stringify(body);
	return new Promise((resolve,reject)=>{
		const req = http.request({ hostname:"localhost", port:3000, path, method:"POST", headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(data)} }, (res)=>{
			let buf=""; res.on("data",(c)=>buf+=c); res.on("end",()=>{ try{ resolve(JSON.parse(buf)); } catch(e){ reject(e);} });
		});
		req.on("error",reject); req.write(data); req.end();
	});
}

async function main(){
	const cities = [
		{ name:"Paris", lat:48.8566, lng:2.3522 },
		{ name:"Lisbon", lat:38.7223, lng:-9.1393 },
	];
	for (const c of cities){
		const res = await post("/api/suggest", { lat:c.lat, lng:c.lng, phase:"transit" });
		assert(res && Array.isArray(res.items), "invalid response");
		const snapshot = res.items.map((it)=>({ id: it.id, total: Math.round(it.scores.total*100)/100 }));
		console.log(c.name, snapshot);
	}
}

main().catch((e)=>{ console.error(e); process.exit(1); }); 