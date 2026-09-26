// Supabase client — shared across all pages
const SUPABASE_URL = 'https://odsxjatgebpwphzbevpu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kc3hqYXRnZWJwd3BoemJldnB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NzIxNDksImV4cCI6MjEwMTU0ODE0OX0.5J0zvsxDeOjWeSkEmXVBTnEPhFXN8I0NGZbOgVTM2T8';

const SUPABASE_FUNCTIONS_URL = SUPABASE_URL + '/functions/v1';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
