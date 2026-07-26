export async function getAccessToken():Promise<string>{
  const stored=await chrome.storage.local.get("access_token");
  return stored.access_token||"dev-user";
}
