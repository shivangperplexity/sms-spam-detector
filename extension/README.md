# SpamShield for Gmail — Chrome extension

SpamShield sorts your Gmail inbox into four groups, right inside Gmail:

| Group | What goes there |
|---|---|
| **Important** | OTPs, verification codes, "confirm your email" links, password resets, new sign-in alerts |
| **Genuine** | People, college and work mail, orders, bank/UPI alerts, bills, calendar invites |
| **Likely spam** | Mail with a low-to-moderate spam or promotional score, such as digests and "rate us" mail |
| **Spam** | Marketing blasts and sales, plus scams and phishing (KYC/lottery/refund/disconnection frauds) |

- Every email row gets a coloured label. Spam and likely-spam labels also show their score.
- A floating bar at the bottom shows **All · Important · Genuine · Likely spam · Spam** with live counts. Click a group to show only that group.
- Click any label to see the class probabilities and the words that drove the decision. You can also **Trust sender**, **Always spam**, or block a whole domain from there.
- When you open an email, a banner at the top says what it is (e.g. *"Spam — looks like a phishing or scam message"*).
- The toolbar popup gives you the on/off switch, sensitivity (Relaxed / Balanced / Strict), counts, a "test a message" box and your sender lists.

Everything runs **on your device**. The extension only needs the `storage` permission and only runs on `mail.google.com`. No email text is ever sent anywhere.

## Install (2 minutes)

1. Download this `extension` folder (or unzip `spamshield-gmail.zip`).
2. Open `chrome://extensions` in Chrome, Edge or Brave.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the `extension` folder.
5. Open or reload [Gmail](https://mail.google.com). The SpamShield bar appears at the bottom of the inbox.

## The model

- **Data:** about 141,000 unique emails and SMS after de-duplication, from:
  - Enron-Spam
  - a phishing corpus (CEAS, Nazario, Nigerian-fraud, SpamAssassin, Ling)
  - Kaggle phishing emails
  - a modern 6-category email set (verification codes, promotions, social, forum, updates, spam)
  - the UCI SMS Spam Collection
  - about 12k synthetic Indian-context emails (`training/synth.py`: OTPs, UPI/bank alerts, sale mailers, KYC/electricity/lottery scams)
- **Features:**
  - Lower-case words plus word pairs (bigrams).
  - Links, amounts, percentages, codes and e-mail addresses are replaced by placeholder tokens (`‹link›`, `‹amount›`, `‹%›`, `‹code›`, `‹email›`).
  - The 30,000 most useful features are kept.
- **Training views:** each email is trained twice, once in full and once as *subject + first 30 words*, because the Gmail list only shows a short snippet.
- **Classifier:** 4-class logistic regression (genuine / important / promo / spam), class-balanced. Weights are int8-quantised, so the whole model is a single ~0.6 MB `model.js`.
- **Rules on top:**
  - An OTP / verification pattern makes an email *Important* unless the model thinks it is a scam.
  - Bulk-mail sender addresses (`offers@`, `newsletter@`, `@mailers.` …) add a small marketing prior.
  - Your trusted and blocked sender lists override the model.
- **Grouping:** junk score = P(promo) + P(spam). With *Balanced* sensitivity, ≥ 78 % is **Spam** and ≥ 45 % is **Likely spam**.

Test-set results are in `training/metrics.txt`.

### Retrain

```bash
cd extension/training
python3 synth.py data/synthetic.csv          # synthetic Indian-context mail
python3 train.py data/                       # needs the public CSVs listed in train.py
node parity.js && node eval_realistic.js     # JS == Python check + hand-written Gmail test
```

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3. Runs only on `https://mail.google.com/*` |
| `model.js` | Trained, quantised model (generated) |
| `classifier.js` | Tokenizer (identical to Python), inference, rules and grouping |
| `content.js` / `content.css` | Gmail row labels, filter bar, opened-mail banner, detail card |
| `popup.html/js/css` | Settings, counts, test box, sender lists |
| `training/` | Data synthesis, training, parity and evaluation scripts |

> Gmail changes its page markup from time to time. SpamShield reads Gmail's standard row structure (`tr.zA`, subject `.bog`, snippet `.y2`). If labels stop appearing after a Gmail update, those selectors in `content.js` are the place to look.
