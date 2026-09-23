// Preencha estas duas constantes DEPOIS de fazer o setup único descrito em
// README.md → "Conectar com Supabase (setup do mantenedor)":
//
// 1. Registre um OAuth App na sua organização Supabase
//    (Organization Settings → OAuth Apps → Add application), usando como
//    Redirect URL: https://lejbdcmemfjnhnkjbilkdcobanlaobmf.chromiumapp.org/
//    Copie o "Client ID" gerado para MANAGEMENT_OAUTH_CLIENT_ID abaixo.
//    (O Client Secret NUNCA vai aqui — ele fica só na Edge Function.)
//
// 2. Publique a Edge Function em supabase/functions/oauth-exchange/ num
//    projeto Supabase seu (pode ser um projeto pequeno só pra isso) e
//    configure OAUTH_CLIENT_ID/OAUTH_CLIENT_SECRET como secrets dela.
//    Copie a URL pública da function para OAUTH_RELAY_URL abaixo.
//
// Enquanto esses valores estiverem vazios, o botão "Conectar com Supabase"
// mostra um erro explicando que o setup do mantenedor ainda não foi feito.

export const MANAGEMENT_OAUTH_CLIENT_ID = '41a66a50-a3d8-4aed-bf2f-a3037bc9cdc5';
export const OAUTH_RELAY_URL = '';
