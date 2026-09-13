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

