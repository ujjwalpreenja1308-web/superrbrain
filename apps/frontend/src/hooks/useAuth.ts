export function useAuth() {
  return {
    user: { id: "00000000-0000-0000-0000-000000000001", email: "dev@covable.ai" },
    loading: false,
    signOut: async () => {},
  };
}
