let accessToken: string | null = null;

export const accessTokenMemory = {
  read: () => accessToken,
  write: (token: string) => {
    accessToken = token;
  },
  clear: () => {
    accessToken = null;
  },
};
