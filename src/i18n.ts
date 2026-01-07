import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const resources = {
  en: {
    translation: {
      login: {
        title: 'Sign in to Kanidm',
        subtitle:
          'Choose passkey or password + TOTP. Built-in admins may require an ephemeral password.',
        username: 'Username',
        password: 'Password',
        totp: 'TOTP',
        passkey: 'Passkey',
        passwordTotp: 'Password + TOTP',
        passwordOnly: 'Password Only',
        continue: 'Continue',
        tryAgain: 'Try Again',
        signingIn: 'Signing in...',
        passkeyPrompt: 'Ready for passkey authentication.',
      },
      shell: {
        title: 'Kanidm Admin',
        subtitle: 'Admin Console',
        signOut: 'Sign out',
        sameOrigin: 'Same-origin API expected',
      },
    },
  },
  zh: {
    translation: {
      login: {
        title: '登录 Kanidm',
        subtitle: '可使用通行密钥或密码 + TOTP。内置管理员可能需要一次性密码。',
        username: '用户名',
        password: '密码',
        totp: 'TOTP',
        passkey: '通行密钥',
        passwordTotp: '密码 + TOTP',
        passwordOnly: '仅密码',
        continue: '继续',
        tryAgain: '重试',
        signingIn: '登录中...',
        passkeyPrompt: '请使用通行密钥完成验证。',
      },
      shell: {
        title: 'Kanidm 管理',
        subtitle: '管理控制台',
        signOut: '退出登录',
        sameOrigin: '同源 API 模式',
      },
    },
  },
} as const

const preferred = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'

i18n.use(initReactI18next).init({
  resources,
  lng: preferred,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
