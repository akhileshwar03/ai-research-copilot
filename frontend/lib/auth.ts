import { getStoredTokens, getUserEmailFromToken, parseJwt } from "@/shared/lib/token-storage";

export function getToken() {
  return getStoredTokens().accessToken;
}

export { parseJwt };

export function getUserEmail() {
  return getUserEmailFromToken(getStoredTokens().accessToken);
}
