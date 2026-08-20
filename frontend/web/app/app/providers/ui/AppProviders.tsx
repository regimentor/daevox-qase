import { App as AntdApp, ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import type { PropsWithChildren } from 'react';
import { ApolloProvider } from '@apollo/client/react';
import { apolloClient } from '@/app/providers/apollo';
import { AuthProvider } from '@/app/providers/auth';

export function AppProviders({ children }: PropsWithChildren) {
  return (
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
          colorBgLayout: '#f5f7fa',
          colorBorderSecondary: '#e7eaf0',
          borderRadius: 7,
          fontSize: 14,
          motion: false,
        },
        components: {
          Table: { cellPaddingBlock: 11 },
          Layout: { headerBg: '#ffffff', siderBg: '#ffffff' },
        },
      }}
    >
      <AntdApp>
        <ApolloProvider client={apolloClient}>
          <AuthProvider>{children}</AuthProvider>
        </ApolloProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
