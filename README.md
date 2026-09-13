# verse-note
 
a simple note made with client side module javascript.  
Firebase - Firestore(database) and Authentication used save data and user login.
Firebase provides server side architecture as API(callback function). 
This note has very essential functions - view, write, edit, delete and login.
So It's quite flexible to develop this note to other type of apps like
diary, chat, simple board, group note(multiple login possible)
One missing feature is image upload.  

## Security rules

`firestore.rules` holds the Firestore security rules. Hiding the edit and
delete buttons in the page only tidies the screen - anyone can open the
browser console and call the SDK directly - so ownership is actually
enforced there:

- anyone may read the entries, because this is a guestbook
- only a signed in user may write, and only under their own uid
- only the author may edit or delete their own entry
- `userId` and `createdAt` cannot be changed by an edit
- every other collection is closed

Deploy them with:

```
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

The rules file carries commented alternatives for the private diary and
single author blog modes that the page's own comments describe.


## RSS

<https://lee-bh.github.io/verse-note/rss/> 가 구독 안내 페이지이고, 실제 피드는
`rss.xml` 입니다. 리더에는 둘 중 아무 주소나 넣으면 됩니다. `/rss/` 페이지의
`<link rel="alternate">` 를 보고 리더가 피드를 찾아갑니다.

글은 Firestore에만 있고 이 저장소는 서버 없는 정적 페이지입니다. RSS 리더는
자바스크립트를 실행하지 않으니 브라우저에서 글을 불러오는 방식으로는 피드를 만들 수
없습니다. 그래서 `.github/workflows/rss.yml` 이 한 시간마다
`scripts/build-rss.mjs` 를 돌려 `rss.xml` 과 `rss/index.html` 을 다시 만들고,
내용이 바뀌었을 때만 커밋합니다. 새 글은 최대 한 시간 뒤에 피드에 올라오고,
바로 반영하고 싶으면 Actions 탭에서 Build RSS feed 워크플로를 직접 실행하면 됩니다.

읽기는 보안 규칙이 모두에게 열려 있어서(위 참고) 이 과정에 인증이 필요 없습니다.
직접 만들어 보려면:

```
node scripts/build-rss.mjs
```

주소가 바뀌면 `SITE_URL` 환경변수로 넘기면 됩니다.
