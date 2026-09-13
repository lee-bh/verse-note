// 방명록 글을 읽어서 RSS 피드를 만든다.
//
// 이 사이트는 서버가 없는 정적 페이지이고 글은 전부 Firestore에 있다.
// RSS 리더는 자바스크립트를 실행하지 않으므로 브라우저에서 글을 불러오는
// 방식으로는 피드를 만들 수 없다. 그래서 깃허브 액션이 주기적으로 이 파일을
// 실행해서 결과물(rss.xml, rss/index.html)을 저장소에 커밋한다.
//
// Firestore 규칙이 읽기를 모두에게 열어두었기 때문에(README 참고)
// 인증 없이 REST API로 그대로 읽을 수 있다.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "auth-test-b35cf";
const COLLECTION = process.env.FIRESTORE_COLLECTION ?? "verse-entries";
// 끝의 슬래시는 하나로 맞춰둔다. 피드 안의 주소는 전부 절대주소여야 한다.
const SITE_URL = (process.env.SITE_URL ?? "https://lee-bh.github.io/verse-note/").replace(/\/*$/, "/");
const FEED_PATH = "rss.xml";
const SITE_TITLE = "난데없는 말들";
const SITE_DESCRIPTION = "파이어베이스를 사용한 간단한 방명록 페이지입니다. 순수 클라이언트 자바스크립트로 구현되었습니다.";
const MAX_ITEMS = 50;

async function fetchEntries() {
    const endpoint = new URL(
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}`
    );
    endpoint.searchParams.set("pageSize", String(MAX_ITEMS));
    endpoint.searchParams.set("orderBy", "createdAt desc");

    const response = await fetch(endpoint, { headers: { accept: "application/json" } });
    if (!response.ok) {
        throw new Error(`Firestore ${response.status} ${response.statusText}: ${await response.text()}`);
    }
    const body = await response.json();
    // 글이 하나도 없으면 documents 자체가 없다
    return (body.documents ?? []).map(toEntry).filter(entry => entry.title || entry.body);
}

function toEntry(document) {
    const fields = document.fields ?? {};
    const id = document.name.split("/").pop();
    const createdAt = fields.createdAt?.timestampValue ?? document.createTime;
    return {
        id,
        title: fields.title?.stringValue ?? "",
        body: fields.entry?.stringValue ?? "",
        createdAt: createdAt ? new Date(createdAt) : null
    };
}

// XML은 &, <, > 를 태그로 읽으므로 글에 들어간 글자를 그대로 두면 피드가 깨진다.
function escapeXml(value) {
    return String(value)
        // XML 1.0이 허용하지 않는 제어문자는 리더가 통째로 파싱을 포기하게 만든다
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

// 줄바꿈을 살리려면 본문을 HTML로 보내야 하는데, description을 그냥 글자로
// 취급하는 리더에서는 태그가 그대로 보인다. 그래서 description에는 글자 그대로를,
// content:encoded에는 HTML을 넣는다. 리더는 둘 중 아는 쪽을 골라 쓴다.
function toHtmlContent(text) {
    const html = escapeXml(text).replace(/\r?\n/g, "<br />");
    // CDATA 안에 ]]>가 들어가면 거기서 구역이 끊겨버린다
    return `<![CDATA[${html.replace(/]]>/g, "]]&gt;")}]]>`;
}

const RFC822_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const RFC822_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// RSS 2.0의 pubDate는 RFC 822 형식이고, toUTCString()과 달리 GMT 대신 +0000을 쓴다.
function toRfc822(date) {
    const pad = number => String(number).padStart(2, "0");
    return [
        `${RFC822_DAYS[date.getUTCDay()]},`,
        pad(date.getUTCDate()),
        RFC822_MONTHS[date.getUTCMonth()],
        date.getUTCFullYear(),
        `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`,
        "+0000"
    ].join(" ");
}

function buildFeed(entries) {
    const feedUrl = `${SITE_URL}${FEED_PATH}`;
    const latest = entries.find(entry => entry.createdAt)?.createdAt ?? new Date();

    const items = entries.map(entry => {
        const link = `${SITE_URL}#${entry.id}`;
        const pubDate = entry.createdAt ? `\n            <pubDate>${toRfc822(entry.createdAt)}</pubDate>` : "";
        return `        <item>
            <title>${escapeXml(entry.title || "(제목 없음)")}</title>
            <link>${escapeXml(link)}</link>
            <guid isPermaLink="false">${escapeXml(entry.id)}</guid>${pubDate}
            <description>${escapeXml(entry.body)}</description>
            <content:encoded>${toHtmlContent(entry.body)}</content:encoded>
        </item>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
    <channel>
        <title>${escapeXml(SITE_TITLE)}</title>
        <link>${escapeXml(SITE_URL)}</link>
        <description>${escapeXml(SITE_DESCRIPTION)}</description>
        <language>ko</language>
        <lastBuildDate>${toRfc822(latest)}</lastBuildDate>
        <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items.join("\n")}
    </channel>
</rss>
`;
}

// /rss/ 로 들어온 사람에게 보여줄 안내 페이지.
// 깃허브 페이지스는 디렉터리 주소에 index.html만 내주므로 이 자리에 XML을 둘 수는 없다.
// 대신 head의 alternate 링크로 리더가 진짜 피드를 찾아가게 한다.
function buildSubscribePage(entries) {
    const feedUrl = `${SITE_URL}${FEED_PATH}`;
    const list = entries.slice(0, 10).map(entry => {
        const date = entry.createdAt ? entry.createdAt.toISOString().slice(0, 10) : "";
        return `                <li><a href="../#${escapeXml(entry.id)}">${escapeXml(entry.title || "(제목 없음)")}</a> <time>${date}</time></li>`;
    });

    return `<!DOCTYPE html>
<html lang="ko">
    <head>
        <meta charset="UTF-8">
        <title>RSS - ${escapeXml(SITE_TITLE)}</title>
        <meta name="description" content="난데없는 말들의 RSS 구독 주소입니다.">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="alternate" type="application/rss+xml" title="${escapeXml(SITE_TITLE)}" href="${escapeXml(feedUrl)}">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Gowun+Batang&display=swap');
            :root{--color-point: #ddd;}
            html{font-family: 'Gowun Batang', serif; line-height: 1.7; font-size: 18px; word-break: keep-all;
            box-sizing: border-box;}
            body, h1, h2, ul, ol, p{font-weight:normal; margin: 0; padding: 0;}
            header, main, footer{width: 550px; margin: 0 auto;}
            header{padding: 4rem 0 2rem;}
            main{padding-bottom: 2rem;}
            footer{padding-bottom: 4rem;}
            h2{font-size: 1.5rem; padding-top: 2rem;}
            p{padding-bottom: 1rem;}
            code{background: var(--color-point); padding: 0.1rem 0.5rem; word-break: break-all;}
            ul{list-style: none;}
            li{padding-bottom: 0.5rem;}
            time{opacity: 0.6; font-size: 0.85rem;}
            @media (max-width: 550px) {
                :root{--color-point: #222;}
                body{background: black;}
                html{font-size: 17px; color: white;}
                header, main, footer{width: calc(100% - 2rem);}
                a{color: #eee;}
            }
        </style>
    </head>
    <body>
        <header>
            <h1>RSS</h1>
            <p><a href="../">난데없는 말들</a>의 새 글을 구독하는 주소입니다.</p>
        </header>
        <main>
            <p>아래 주소를 RSS 리더에 넣으세요.</p>
            <p><code><a href="${escapeXml(feedUrl)}">${escapeXml(feedUrl)}</a></code></p>
            <p>이 페이지 주소(<code>${escapeXml(SITE_URL)}rss/</code>)를 그대로 넣어도 리더가 위 피드를 찾아갑니다.</p>
            <h2>최근 글</h2>
            <ul>
${list.join("\n")}
            </ul>
        </main>
        <footer>
            <p>verse note&copy;2025. 이병학.</p>
        </footer>
    </body>
</html>
`;
}

const entries = await fetchEntries();
await mkdir(join(repoRoot, "rss"), { recursive: true });
await writeFile(join(repoRoot, FEED_PATH), buildFeed(entries));
await writeFile(join(repoRoot, "rss", "index.html"), buildSubscribePage(entries));
console.log(`wrote ${FEED_PATH} and rss/index.html (${entries.length} entries)`);
