import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://eealqbndatiltkjzbcye.supabase.co', 'sb_publishable_lvoq2BFs7vclifAlzRvglw_lZVBjd8n');

async function run() {
  const { data, error } = await supabase
    .from('restaurants')
    .update({ subscription_status: 'active' })
    .neq('id', '00000000-0000-0000-0000-000000000000'); // update all restaurants
  
  console.log('Update result:', { data, error });
}
run();
