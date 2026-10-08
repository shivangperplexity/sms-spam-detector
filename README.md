# SpamShield — SMS Spam & Scam Detector

Paste any SMS and SpamShield tells you whether it looks like spam, which words tipped the decision, which known messages it resembles, and what each of three models thinks. Everything runs in the browser.

Mini project for **Data Mining and Analytics**.

## What it does
| Part | Technique |
|---|---|
| Data cleaning | duplicate removal, lower-casing, URL / phone / money / number normalisation, punctuation and stop-word removal, suffix stemming |
| Classification | Multinomial **Naive Bayes** (Laplace smoothing), **k-NN** (k = 5, TF-IDF, cosine similarity via an inverted index), **Decision tree** (CART, Gini, 8 numeric features) |
| Evaluation | stratified 80/20 split, accuracy, precision, recall, F1, confusion matrices, adjustable decision threshold |
| Explanation | per-word log-likelihood ratio highlighting, nearest neighbours, decision-tree path |
| Pattern mining | frequent words per class, **Apriori** association rules on spam word-sets (support, confidence, lift) |

## Dataset
`data/sms_spam.tsv` — SMS Spam Collection v.1 (T. A. Almeida and J. M. Gómez Hidalgo), UCI Machine Learning Repository: 5,574 English SMS labelled `ham` or `spam` (5,159 after removing duplicates).

## Run locally
```bash
python3 -m http.server 8000
```
No build step and no external libraries.
