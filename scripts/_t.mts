const store: Record<string,string> = {};
(globalThis as any).localStorage = { getItem:(k:string)=>store[k]??null, setItem:(k:string,v:string)=>{store[k]=v}, removeItem:(k:string)=>{delete store[k]}, key:()=>null, length:0 };
(globalThis as any).window = undefined; (globalThis as any).navigator = { onLine: true };
const calls: string[] = [];
const fake = { collection: () => ({
  update: async (id:string,b:any)=>{calls.push('U'); return {id}},
  create: async (b:any)=>{calls.push('C'); return {id:'r'+Math.random()}},
  delete: async ()=>{calls.push('D')}, getFullList: async()=>[], getFirstListItem: async()=>null }), filter: (s:string)=>s };
const mod = await import('../src/lib/pocketbase.ts').catch(()=>null);
