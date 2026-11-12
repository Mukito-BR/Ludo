const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, 'public');
const rooms = new Map();
const COLORS = ['red', 'green', 'yellow', 'blue'];
const START = { red: 13, green: 0, yellow: 39, blue: 26 };
const TRACK = 52;
const ROOM_TTL = 2 * 60 * 60 * 1000;

function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(body)); }
function readBody(req) { return new Promise((resolve, reject) => { let s=''; req.on('data', c => { s+=c; if(s.length>12000) req.destroy(); }); req.on('end',()=>{try{resolve(JSON.parse(s||'{}'))}catch(e){reject(e)}}); }); }
function roomView(room) { return { code:room.code, name:room.name, players:room.players.map(p=>({id:p.id,name:p.name,color:p.color})), started:room.started, turn:room.turn, dice:room.dice, message:room.message, winner:room.winner, pieces:room.pieces, version:room.version }; }
function createRoom(ownerName, name) { let code; do { code=crypto.randomBytes(3).toString('hex').toUpperCase(); } while(rooms.has(code)); const now=Date.now(); const room={code,name,createdAt:now,updatedAt:now,players:[],started:false,turn:0,dice:null,message:`${name} criada por ${ownerName}. Aguardando jogadores.`,winner:null,pieces:{},version:0}; rooms.set(code,room); return room; }
function current(room) { return room.players[room.turn]; }
function bump(room, message) { room.message=message; room.updatedAt=Date.now(); room.version++; }
function removePlayer(room, playerId) { const index=room.players.findIndex(p=>p.id===playerId); if(index<0)return false; const name=room.players[index].name;room.players.splice(index,1);delete room.pieces[playerId];if(!room.players.length){rooms.delete(room.code);return true;}if(index<room.turn)room.turn--;if(room.turn>=room.players.length)room.turn=0;if(room.started&&room.players.length<2){room.started=false;room.dice=null;room.turn=0;}bump(room,`${name} saiu da sala.`);return true; }
function validPiece(room, player, i) { return Number.isInteger(i) && i>=0 && i<4 && room.pieces[player.id] && Number.isInteger(room.pieces[player.id][i]); }
function groupIndices(room, player, i) { const pos=room.pieces[player.id][i]; if(pos<0 || pos>=57) return [i]; return room.pieces[player.id].map((p,index)=>p===pos?index:-1).filter(index=>index>=0); }
function canMove(room, player, i, die) { const pos=room.pieces[player.id][i]; if(pos===-1)return die===6; return pos>=0 && pos<57 && groupIndices(room,player,i).every(index=>room.pieces[player.id][index]+die<=57); }
function roll(room) { const n=crypto.randomInt(1,7); room.dice=n; const p=current(room); const movable=room.pieces[p.id].some((pos,i)=>canMove(room,p,i,n)); bump(room, movable ? `${p.name} tirou ${n}. Escolha uma peça.` : `${p.name} tirou ${n}, mas não pode mover.`); if(!movable) { room.dice=null; room.turn=(room.turn+1)%room.players.length; } }
function move(room, pieceIndex) { const player=current(room); const old=room.pieces[player.id][pieceIndex]; const n=room.dice; const group=groupIndices(room,player,pieceIndex);
  for(const i of group) room.pieces[player.id][i]=old===-1?0:old+n;
  const pos=room.pieces[player.id][pieceIndex]; let captured=0;
  if(pos>=0 && pos<52) { const global=(START[player.color]+pos)%52; for(const other of room.players) { if(other.id===player.id) continue; room.pieces[other.id].forEach((op,i)=>{ if(op>=0 && op<52 && (START[other.color]+op)%52===global) { room.pieces[other.id][i]=-1; captured++; } }); } }
  if(room.pieces[player.id].every(x=>x===57)) { room.winner=player.id; room.dice=null; bump(room, `${player.name} venceu a partida!`); return true; }
  const extra=n===6 || captured>0; room.dice=null; if(!extra) room.turn=(room.turn+1)%room.players.length;
  bump(room, `${player.name} moveu uma peça${captured?` e capturou ${captured}!`:'.'}${extra?' Joga novamente.':''}`); return true;
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});return res.end();}
  if(url.pathname.startsWith('/api/')) {
    try {
      if(req.method==='GET' && url.pathname==='/api/colors') { const room=rooms.get(String(url.searchParams.get('room')||'').trim().toUpperCase()); if(!room)return json(res,404,{error:'Sala não encontrada. Confira o código.'});return json(res,200,{used:room.players.map(p=>p.color),started:room.started,full:room.players.length>=4}); }
      if(req.method==='GET' && url.pathname==='/api/rooms') { const list=[...rooms.values()].filter(room=>Date.now()-(room.updatedAt||room.createdAt||0)<2*60*60*1000).sort((a,b)=>(b.updatedAt||b.createdAt)-(a.updatedAt||a.createdAt)).map(room=>({name:room.name||`Sala de ${room.players[0]?.name||'Ludo'}`,players:room.players.map(p=>({name:p.name,color:p.color})),started:room.started,winner:room.winner,count:room.players.length,updatedAt:room.updatedAt}));return json(res,200,{rooms:list}); }
      if(req.method==='POST' && url.pathname==='/api/room') { const b=await readBody(req), name=String(b.name||'').trim().slice(0,24), roomName=String(b.roomName||'').trim().slice(0,32)||(name?`Sala de ${name}`:''), color=String(b.color||''); if(!name)return json(res,400,{error:'Digite seu nome.'});if(!COLORS.includes(color))return json(res,400,{error:'Escolha uma cor disponível.'}); const room=createRoom(name,roomName); const player={id:crypto.randomUUID(),name,color};room.players.push(player);room.pieces[player.id]=[-1,-1,-1,-1];room.message=`${name} criou a sala ${room.name}. Compartilhe o ID ${room.code}.`;room.version++;return json(res,200,{...roomView(room),playerId:player.id}); }
      if(req.method==='POST' && url.pathname==='/api/join') { const b=await readBody(req), code=String(b.code||'').trim().toUpperCase(), name=String(b.name||'').trim().slice(0,24),color=String(b.color||''),room=rooms.get(code); if(!name)return json(res,400,{error:'Digite seu nome.'});if(!room)return json(res,404,{error:'Sala não encontrada. Confira o código.'});const returning=room.players.find(p=>p.name.toLowerCase()===name.toLowerCase());if(returning){bump(room,`${returning.name} voltou para a sala.`);return json(res,200,{...roomView(room),playerId:returning.id});}if(room.started)return json(res,409,{error:'A partida já começou. Use o mesmo nome da partida para voltar.'});if(room.players.length>=4)return json(res,409,{error:'A sala está cheia.'});if(!COLORS.includes(color))return json(res,400,{error:'Escolha uma cor.'});if(room.players.some(p=>p.color===color))return json(res,409,{error:'Essa cor já foi escolhida. Selecione outra.'});const player={id:crypto.randomUUID(),name,color};room.players.push(player);room.pieces[player.id]=[-1,-1,-1,-1];bump(room,`${name} entrou na sala.`);return json(res,200,{...roomView(room),playerId:player.id}); }
      if(req.method==='POST' && url.pathname==='/api/leave') { const b=await readBody(req),code=String(b.room||'').trim().toUpperCase(),room=rooms.get(code);if(!room)return json(res,404,{error:'A sala já foi encerrada.'});if(!room.players.some(p=>p.id===b.playerId))return json(res,403,{error:'Jogador inválido.'});removePlayer(room,b.playerId);return json(res,200,{left:true,closed:!rooms.has(code)}); }
      if(req.method==='POST' && url.pathname==='/api/room/end') { const b=await readBody(req),code=String(b.room||'').trim().toUpperCase(),room=rooms.get(code);if(!room)return json(res,404,{error:'A sala já foi encerrada.'});if(!room.players.some(p=>p.id===b.playerId))return json(res,403,{error:'Jogador inválido.'});if(room.players[0].id!==b.playerId)return json(res,403,{error:'Só o anfitrião pode encerrar a partida.'});rooms.delete(code);return json(res,200,{closed:true}); }
      if(req.method==='POST' && url.pathname==='/api/room/reset') { const b=await readBody(req),code=String(b.room||'').trim().toUpperCase(),room=rooms.get(code);if(!room)return json(res,404,{error:'A sala já foi encerrada.'});if(!room.players.some(p=>p.id===b.playerId))return json(res,403,{error:'Jogador inválido.'});if(room.players[0].id!==b.playerId)return json(res,403,{error:'Só o anfitrião pode reiniciar a partida.'});for(const p of room.players)room.pieces[p.id]=[-1,-1,-1,-1];room.started=false;room.turn=0;room.dice=null;room.winner=null;bump(room,`${room.name} foi reiniciada. O anfitrião pode iniciar novamente.`);return json(res,200,roomView(room)); }
      const roomCode=url.searchParams.get('room')?.toUpperCase(), room=rooms.get(roomCode);
      if(req.method==='GET' && url.pathname==='/api/state') { if(!room)return json(res,404,{error:'Sala não encontrada.'});room.updatedAt=Date.now();return json(res,200,roomView(room)); }
      if(req.method==='POST' && url.pathname==='/api/action') { if(!room)return json(res,404,{error:'Sala não encontrada.'}); const b=await readBody(req), player=room.players.find(p=>p.id===b.playerId); if(!player)return json(res,403,{error:'Jogador inválido.'}); if(!room.started && !b.action.startsWith('start'))return json(res,409,{error:'A partida ainda não começou.'}); if(room.winner)return json(res,409,{error:'A partida terminou.'});
        if(b.action==='start') { if(room.players[0].id!==player.id)return json(res,403,{error:'Só quem criou a sala pode iniciar.'});if(room.players.length<2)return json(res,409,{error:'São necessários pelo menos 2 jogadores.'});room.started=true;room.turn=0;roll(room); }
        else { if(current(room)?.id!==player.id)return json(res,409,{error:'Espere a sua vez.'});if(b.action==='roll'){if(room.dice!==null)return json(res,409,{error:'Escolha uma peça primeiro.'});roll(room);}else if(b.action==='move'){if(room.dice===null)return json(res,409,{error:'Role o dado primeiro.'});if(!validPiece(room,player,b.piece)||!canMove(room,player,b.piece,room.dice))return json(res,409,{error:'Essa peça ou conjunto não pode andar esse número.'});move(room,b.piece);}else return json(res,400,{error:'Ação inválida.'}); }
        return json(res,200,roomView(room)); }
      return json(res,404,{error:'Rota não encontrada.'});
    } catch(e){return json(res,400,{error:'Não foi possível processar o pedido.'});}
  }
  let file=url.pathname==='/'?'index.html':url.pathname.slice(1); file=path.resolve(ROOT,file); if(!file.startsWith(ROOT+path.sep)&&file!==path.join(ROOT,'index.html')){res.writeHead(403);return res.end();} fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}const type=file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html';res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});res.end(data);});
});
setInterval(()=>{const now=Date.now();for(const [code,room] of rooms)if(now-(room.updatedAt||room.createdAt||now)>ROOM_TTL)rooms.delete(code);},60*1000).unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`Ludo disponível em http://localhost:${PORT}`));

