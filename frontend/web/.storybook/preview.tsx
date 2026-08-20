import type { Preview } from '@storybook/react-vite';
import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { App, ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { MemoryRouter } from 'react-router';
import { mswLoader } from 'msw-storybook-addon/csf3';
import { http, passthrough } from 'msw';
import '@/app/styles/global.css';

const preview: Preview = {
  loaders: [mswLoader()],
  decorators: [
    (Story) => {
      const client = new ApolloClient({
        link: new HttpLink({ uri: '/graphql' }),
        cache: new InMemoryCache(),
      });
      return (
        <MemoryRouter>
          <ConfigProvider
            locale={ruRU}
            theme={{
              token: {
                colorPrimary: '#3442b8',
                colorLink: '#3442b8',
                colorTextSecondary: '#5b5f68',
                colorTextDescription: '#4b4f58',
                colorTextPlaceholder: '#62666d',
                colorTextDisabled: '#62666d',
                colorError: '#c5222a',
                colorErrorText: '#a8071a',
                colorWarning: '#8a5200',
                colorSuccess: '#18753c',
                borderRadius: 7,
                motion: false,
              },
              components: {
                Layout: { headerBg: '#ffffff', siderBg: '#ffffff' },
              },
            }}
          >
            <App>
              <ApolloProvider client={client}>
                <div style={{ padding: 20 }}>
                  <Story />
                </div>
              </ApolloProvider>
            </App>
          </ConfigProvider>
        </MemoryRouter>
      );
    },
  ],
  parameters: {
    msw: { handlers: [http.post('/__coverage__', () => passthrough())] },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'error' },
    options: { storySort: { order: ['Shared', 'Repository', 'Runs', 'Execution'] } },
  },
};

export default preview;
