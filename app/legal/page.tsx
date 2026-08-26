// app/legal/page.tsx — Cap & Crease: Terms, Privacy & Independence
//
// One page, because a reader should not have to visit three to learn what this
// site is, what it does with them, and what a donation buys.
//
// EVERY CLAIM HERE IS CHECKED AGAINST THE CODE. That is the only property that
// matters in a document like this, and it is the one that decays first: if you
// add an account system, a cookie, a tracker, or a third party that receives
// anything, this page is wrong until you change it. The privacy section names
// the specific storage keys and the specific services so a reader — or you, in
// a year — can verify it rather than trust it.
//
// As of writing: no accounts, no visitor cookies, no advertising, no
// cross-site tracking, and nothing sold. Where that is true it is stated
// plainly, and where something IS sent somewhere, that is stated just as
// plainly rather than buried.

import React from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { BRAND } from "@/app/lib/brand";
import { publicRouteMetadata } from "@/app/lib/public-seo";

export const metadata = publicRouteMetadata({
  path: "/legal",
  title: "Terms, Privacy & Independence — Cap & Crease",
  description:
    "What Cap & Crease is, what it does with your data, and what a donation supports. Independent and unaffiliated with the National Hockey League.",
});

/** Where a reader can reach a person. Change this in one place. */
const CONTACT_URL = "https://github.com/BradyCorps/nhlTradeMachine/issues";
const CONTACT_LABEL = "the project's GitHub issues";

const LAST_UPDATED = "13 August 2026";

interface Section {
  id: string;
  title: string;
  paras: (string | React.ReactElement)[];
}

const SECTIONS: Section[] = [
  {
    id: "independence",
    title: "Independence — read this first",
    paras: [
      "Cap & Crease is an independent project. It is not affiliated with, endorsed by, sponsored by, or connected to the National Hockey League, the NHL Players' Association, or any NHL club.",
      "NHL and club names, logos, and trademarks belong to their respective owners. They are used here descriptively — to say which players and teams the analysis is about — and never to suggest that the league or any club is involved in this site or approves of it.",
      "Player names, statistics, and images come from public sources, principally the NHL's own public APIs and MoneyPuck. Ownership of that material is not claimed. Every valuation, rating, verdict, and opinion on this site is the author's, produced by his own model, and should not be attributed to any of those sources.",
    ],
  },
  {
    id: "what-this-is",
    title: "What the numbers are, and what they are not",
    paras: [
      "Everything here is an estimate produced by a model. X-NAV, Player Gravity, STRAND, the GM Audit, and the simulation engine are one person's attempt to price hockey decisions. They are published so they can be argued with, which is the opposite of being authoritative.",
      "The model is often wrong, and it is wrong in ways that are documented rather than hidden. It carries a measured error bar, it is weaker on goaltenders than on skaters, and it cannot see everything a front office sees. Where it is uncertain, the site is built to say so rather than to round the doubt away.",
      "Nothing on this site is financial, betting, investment, employment, medical, or legal advice, and none of it is a prediction of what any team or player will actually do. Do not wager on it. If you make a decision that costs you something because a number here said so, that is a decision you made.",
      "The site is provided as it is, without any warranty. It may be unavailable, incomplete, or out of date at any time. Contract and roster data is maintained by hand and will sometimes lag reality.",
    ],
  },
  {
    id: "using",
    title: "Using the site",
    paras: [
      "There are no accounts and no sign-up. The site is free to read and use for personal, non-commercial purposes — build trades, share them, argue about them.",
      "Please do not scrape it, hammer the API routes, or resell the data or valuations. The public endpoints have request limits, and they exist so that one script cannot take the site away from everybody else. Hosting is paid for out of pocket.",
      "The source code is published for reading, not for reuse: it is all rights reserved, and the terms are in the LICENSE file in the repository. Permission may well be given — it just has to be asked for.",
    ],
  },
  {
    id: "privacy",
    title: "Privacy — what is collected",
    paras: [
      "There are no accounts, so there is nothing to sign up for and no profile to build. No advertising, no advertising networks, no cross-site tracking, and no selling or sharing of data with anyone for marketing. Neither the site nor its author has any interest in who you are.",
      "No cookies are set for visitors. The only cookie this site issues is a signed session for the author's own admin area, and you will never receive one by reading the site.",
      "Some things are saved in your own browser, on your device, and are never sent to the server: whether you have dismissed the welcome notice (cap-and-crease-welcomed-v1), an in-progress Cup Run (cup-run-state-v1), saved trade scenarios (nhl-trade-scenarios), fantasy draft board settings and picks (hl:fantasy:settings:v1, hl:fantasy:taken:v1), and Press Box puzzle progress and streak (press-box-state-…, press-box-streak). Clearing your browser storage deletes all of it, and nothing here can recover it.",
      "The site is hosted by Vercel, which keeps standard server request logs, and it uses Vercel Speed Insights to measure page-load performance. Both are Vercel services and are governed by Vercel's privacy policy rather than by this page.",
      "The request limits on the public endpoints count requests per address. To do that, your IP address is written into a short-lived counter key — 60 seconds for trade evaluation and simulation, and up to 24 hours for the narrative feature's daily ceiling — and then it expires. It is used to count and nothing else: not stored alongside anything you did, not analysed, and not retained after the counter expires.",
      "The written trade summaries are generated by Anthropic's Claude API. When you ask for one, the trade you built — player names, club names, and the figures the model computed — is sent to Anthropic to produce the text. No information about you is included, because none is collected. Anthropic's handling of that request is governed by its own terms.",
      "Sharing a trade does not store it here. The whole trade is encoded into the link itself, which is why share links are long. There is no database of shared trades, and deleting your copy of the link is the end of it.",
    ],
  },
  {
    id: "donations",
    title: "Donations — what they are, and what they are not",
    paras: [
      "Donations are handled entirely by Buy Me a Coffee. Payment details are given to them and never reach this site, which never sees a card number.",
      "A donation is a voluntary gift. It is not a purchase, a subscription, a membership, or a contract. It buys no feature, no access, no priority, no influence over any rating, and no service — everything on the site is free to everyone whether they give anything or not, and will stay that way.",
      "Because it is a gift and not a purchase, it is not refundable, and no goods or services are provided in return. This is not a registered charity and a donation is not tax-deductible.",
      "What the money actually does: it pays hosting, database, and API bills, and any surplus goes toward building more of the site. No promise is made about what gets built, or when, or that the site will keep running. It is one person's nights and weekends, and it is honest to say that up front rather than to imply a roadmap.",
    ],
  },
  {
    id: "changes",
    title: "Changes, and getting in touch",
    paras: [
      "If what this site does changes, this page changes with it. The date below is the last time it did.",
      <>
        Questions about anything here — including a request to use the code or a
        correction to a player&apos;s data — can go to{" "}
        <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer"
          className="underline hover:text-ledger-red transition-colors">
          {CONTACT_LABEL}
        </a>. Security problems have their own reporting route, described in the
        repository&apos;s SECURITY file — please use that one rather than a public issue.
      </>,
    ],
  },
];

export default function LegalPage() {
  return (
    <main className="min-h-screen" style={{ background: "var(--paper)" }}>
      <Header />
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <header className="pt-6 pb-5 text-center border-b-2" style={{ borderColor: "var(--ledger-rule)" }}>
          <h1 className="font-mono text-[11px] sm:text-xs font-black uppercase tracking-[0.28em] sm:tracking-[0.44em] leading-relaxed text-ledger-ink">
            Terms, Privacy &amp; Independence
          </h1>
          <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ledger-ink-body leading-relaxed">
            Plain language, and accurate to what the site actually does.
          </p>
        </header>

        <div className="py-6">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="mb-7">
              <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-ledger-ink border-b pb-2 mb-3"
                style={{ borderColor: "var(--ledger-rule)" }}>
                {s.title}
              </h2>
              {s.paras.map((p, i) => (
                <p key={i} className="text-[12.5px] font-serif leading-[1.85] mb-3 text-ledger-ink-body">
                  {p}
                </p>
              ))}
            </section>
          ))}

          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ledger-rule text-center border-t pt-4"
            style={{ borderColor: "var(--ledger-rule)" }}>
            Last updated {LAST_UPDATED} · {BRAND.name} · {BRAND.domain}
          </p>
        </div>

        <Footer />
      </div>
    </main>
  );
}
