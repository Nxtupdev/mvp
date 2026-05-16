import Landing from './_landing/Landing'

// Server entry — the locale is already set by the LocaleProvider in
// the root layout (read from cookie). Landing itself is a client
// component so it can use useLocale() to swap strings.
export default function Page() {
  return <Landing />
}
