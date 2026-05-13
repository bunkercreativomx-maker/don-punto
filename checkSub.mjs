import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://eealqbndatiltkjzbcye.supabase.co', 'sb_publishable_lvoq2BFs7vclifAlzRvglw_lZVBjd8n');
async function run() {
  const { data, error } = await supabase.from('restaurants').select('*');
  console.log('Fetch result:', data, error);
}
run();
