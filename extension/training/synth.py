"""Generate modern, Indian-context example emails to complement the public corpora.

The public datasets (Enron, SpamAssassin, phishing corpora) are mostly 2000s-era
mail. A 2026 Gmail inbox also has OTPs, UPI/bank alerts, food-delivery offers,
college/ERP mails and KYC scams, so we add varied template-based examples for
four classes: important, genuine, promo, spam.
"""
import csv
import random
import sys

R = random.Random(2026)
pick = R.choice


def code(n=None):
    n = n or pick([4, 6, 6, 6, 8])
    return "".join(R.choice("0123456789") for _ in range(n))


def amt():
    return pick(["₹", "Rs. ", "INR ", "Rs "]) + f"{R.randint(49, 98000):,}" + pick(["", ".00"])


def mins():
    return pick(["5", "10", "15", "30"])


NAMES = ["Rahul", "Priya", "Aman", "Sneha", "Arjun", "Kavya", "Rohan", "Ananya", "Vikram", "Isha", "Karan", "Neha", "Aditya", "Pooja", "Siddharth", "Meera"]
SERVICES = ["Google", "Microsoft", "Apple ID", "Amazon", "Flipkart", "Paytm", "PhonePe", "Google Pay", "HDFC Bank", "SBI", "ICICI Bank", "Axis Bank", "Kotak", "IRCTC",
            "DigiLocker", "UIDAI", "GitHub", "LinkedIn", "Instagram", "Facebook", "WhatsApp", "Swiggy", "Zomato", "Uber", "Ola", "Zerodha", "Groww", "CRED", "Netflix",
            "Spotify", "Discord", "Slack", "Notion", "Coursera", "Unstop", "Naukri", "college ERP", "Vercel", "Dropbox", "Twitter", "Reddit", "Steam", "Airtel", "Jio"]
BRANDS = ["Myntra", "Ajio", "Flipkart", "Amazon", "Swiggy", "Zomato", "Nykaa", "Croma", "MakeMyTrip", "BookMyShow", "Coursera", "Udemy", "boAt", "Lenskart", "Meesho",
          "Tata CLiQ", "Reliance Digital", "Domino's", "Pizza Hut", "Blinkit", "Zepto", "BigBasket", "Uber Eats", "Puma", "Nike", "Adidas", "H&M", "Decathlon",
          "Pepperfry", "Urban Company", "Cleartrip", "Goibibo", "Airtel Xstream", "JioCinema", "Hotstar", "Spotify", "Grammarly", "Canva", "Skillshare", "upGrad"]


def important():
    s, c = pick(SERVICES), code()
    subj = pick([
        f"{c} is your {s} verification code", f"Your {s} OTP is {c}", f"{s}: Your one-time password", f"Verify your email address for {s}",
        f"{s} sign-in code", f"Confirm your {s} account", f"Your {s} security code", f"Reset your {s} password", f"{s} login attempt — verification required",
        f"Two-step verification code for {s}", f"Activate your {s} account", f"{s}: confirm your new email", f"New sign-in to your {s} account",
        f"Your {s} passcode", f"Email verification — {s}", f"Complete your {s} registration",
    ])
    body = pick([
        f"Hi {pick(NAMES)}, use the code {c} to verify your account. This code expires in {mins()} minutes. If you didn't request this, you can ignore this email.",
        f"Your one-time password (OTP) is {c}. Do not share this OTP with anyone. {s} will never ask for your OTP.",
        f"Enter {c} on the {s} sign-in page to continue. The code is valid for {mins()} minutes.",
        f"Please confirm your email address by clicking the link below: https://{s.lower().replace(' ', '')}.com/verify?token={code(8)} This link expires in 24 hours.",
        f"We received a request to reset the password for your {s} account. Click here to choose a new password: https://accounts.{s.lower().replace(' ', '')}.com/reset. If this wasn't you, secure your account.",
        f"Your verification code is {c}. For your security, never share it. Requested at {R.randint(1, 12)}:{R.randint(10, 59)} {pick(['AM', 'PM'])} IST.",
        f"Welcome to {s}! Verify your email to activate your account: https://{s.lower().replace(' ', '')}.com/activate/{code(8)}",
        f"A new sign-in was detected on {pick(['Windows', 'Android', 'iPhone', 'Chrome on Mac'])} near {pick(['Mumbai', 'Delhi', 'Pune', 'Bengaluru'])}. If this was you, no action is needed. Otherwise review your account activity.",
        f"OTP for your transaction of {amt()} at {pick(BRANDS)} is {c}. Valid for {mins()} min. Do not share with anyone.",
        f"Your login OTP for {s} is {c}. Valid for {mins()} minutes. If you did not request it, please contact customer care.",
    ])
    return subj, body


def genuine():
    n1, n2 = pick(NAMES), pick(NAMES)
    kind = R.randint(0, 9)
    if kind == 0:  # bank / UPI alerts
        a = amt()
        return (pick([f"Alert: {a} debited from your account", f"Transaction alert from {pick(['HDFC Bank', 'SBI', 'ICICI Bank', 'Axis Bank', 'Kotak'])}", "UPI payment successful", f"You received {a}"]),
                pick([f"Dear customer, {a} has been debited from A/c XX{code(4)} on {R.randint(1, 28)}-{pick(['Sep', 'Oct', 'Nov'])}-26 to VPA {n1.lower()}@okaxis. Avl bal {amt()}.",
                      f"{a} credited to your account XX{code(4)} by UPI ref {code(8)}{code(4)}. Not you? Call the bank.",
                      f"Your payment of {a} to {pick(BRANDS)} was successful. UPI transaction ID {code(8)}{code(4)}."]))
    if kind == 1:  # orders / deliveries
        b = pick(BRANDS)
        return (pick([f"Your {b} order has been shipped", f"Delivered: your {b} order", f"Order confirmed — #{code(8)}", f"Your {b} order is out for delivery", f"Refund processed for order {code(8)}"]),
                pick([f"Hi {n1}, your order #{code(8)} will arrive by {pick(['Monday', 'Tuesday', 'tomorrow', 'today'])}. Track your package in the app.",
                      f"Your refund of {amt()} has been initiated and will reflect in 5-7 working days.",
                      f"Thank you for your order. Invoice attached. Items: 1 x {pick(['earphones', 'running shoes', 'notebook', 'charger', 'kurta'])}."]))
    if kind == 2:  # college
        return (pick(["Mid-semester exam timetable", "Assignment 3 deadline extended", "Lab session rescheduled", "Project review on Friday", "Attendance shortage notice",
                      "Placement drive registration", "Guest lecture tomorrow at 11 AM", "Fee payment receipt", "Hackathon team details", "Internship offer letter"]),
                pick([f"Dear students, the {pick(['DAA', 'DMA', 'OS', 'CN', 'DBMS'])} {pick(['assignment', 'lab', 'mini project report'])} is due on {R.randint(1, 28)} October. Submit on the portal.",
                      f"Hi {n1}, please find the attached schedule. The review will be held in Lab {R.randint(1, 9)} at {R.randint(9, 4 + 12)}:00. Bring your report and laptop.",
                      f"Dear {n1}, congratulations! You have been shortlisted for the next round. Interview details are attached.",
                      "Please fill in the attached form by Friday. Contact the department office for any queries. Regards, HOD"]))
    if kind == 3:  # personal / work
        return (pick([f"Re: {pick(['notes', 'plan for Sunday', 'project report', 'trip photos', 'meeting'])}", f"Catch up this weekend?", "Quick question", f"Fwd: {pick(['slides', 'minutes', 'resume', 'tickets'])}",
                      f"Meeting invite: {pick(['sprint planning', 'weekly sync', 'design review'])}", "Happy birthday!", "Can you review this?"]),
                pick([f"Hey {n1}, are you free on Saturday? Let's work on the presentation together. – {n2}",
                      f"Hi {n1}, attaching the report draft. Let me know your comments before Thursday. Thanks, {n2}",
                      f"Hi team, the meeting is moved to 4 PM. Agenda: progress update and next steps.",
                      f"Thanks for your help yesterday. I've pushed the changes to GitHub, please pull and test.",
                      f"Hi {n1}, here are the photos from the trip. Mom says hi! See you at Diwali."]))
    if kind == 4:  # notifications
        s = pick(["GitHub", "LinkedIn", "Google Calendar", "Google Drive", "Slack", "Jira", "Notion", "Zoom", "Microsoft Teams"])
        return (pick([f"[{s}] New comment on your pull request", f"{n1} shared a document with you", f"Invitation: {pick(['Standup', 'Viva', 'Review'])} @ {R.randint(9, 17)}:00",
                      f"{n1} sent you a message", f"Your {s} weekly summary", f"{n1} mentioned you in a comment"]),
                pick([f"{n1} commented: 'Looks good, just fix the failing test.' Reply to this email directly or view it on {s}.",
                      f"{n1} has shared '{pick(['DAA report', 'Project plan', 'Budget sheet'])}' with you. Open in Docs.",
                      f"You have a new message from {n1}: 'Hi, are you available for a quick call?'"]))
    if kind == 5:  # bills / travel
        return (pick(["Your electricity bill is generated", "Booking confirmed: PNR " + code(10), "Your e-ticket", "Boarding pass for your flight", "Rent receipt", "Insurance policy document"]),
                pick([f"Your bill of {amt()} for {pick(['September', 'October'])} is due on {R.randint(1, 28)}th. Pay via the app or website.",
                      f"PNR {code(10)}, train {code(5)}, {pick(['Delhi', 'Mumbai', 'Pune'])} to {pick(['Jaipur', 'Lucknow', 'Goa'])}, coach B{R.randint(1, 6)} berth {R.randint(1, 72)}. Happy journey.",
                      "Please find your policy document attached. Keep it for your records."]))
    if kind == 6:  # job
        return (pick(["Application received", "Interview scheduled", "Your application status", "Offer letter", "Assessment link for your application"]),
                pick([f"Hi {n1}, thank you for applying for the {pick(['SDE Intern', 'Data Analyst', 'Frontend Developer'])} role. We will get back to you soon.",
                      f"Your interview is scheduled on {R.randint(1, 28)} Oct at {R.randint(10, 17)}:00 on Google Meet. Link attached.",
                      "Please complete the online assessment within 48 hours using the link shared."]))
    if kind == 7:
        return (pick(["Your monthly statement is ready", "Account statement for September", "Tax invoice", "Your subscription receipt"]),
                pick([f"Your statement for card ending {code(4)} is ready. Total due {amt()}, minimum due {amt()}.", "Thank you for your payment. Your receipt is attached."]))
    if kind == 8:
        return (pick(["Notes from today's class", "Group project roles", "Sharing the dataset", "Doubt about question 4"]),
                pick([f"Hi {n1}, I uploaded the notes to the drive folder. Question 4 uses dynamic programming, see page 12.",
                      f"Let's split the work: {n1} does the UI, {n2} does the algorithm part, I'll write the report."]))
    return (pick(["Security alert", "Password changed", "Your account details were updated"]),
            pick(["Your password was changed successfully. If you didn't do this, reset it immediately from the official app.",
                  "Your phone number was updated on your account. If this was you, no further action is needed."]))


def promo():
    b, p = pick(BRANDS), R.choice([10, 20, 25, 30, 40, 50, 60, 70, 80, 90])
    subj = pick([
        f"Flat {p}% OFF on everything!", f"🔥 Big sale is LIVE — up to {p}% off", f"Last chance: {p}% off ends tonight", f"{pick(NAMES)}, your exclusive offer inside",
        f"Buy 1 Get 1 free at {b}", f"Your coupon {pick(['WELCOME', 'SAVE', 'FEST', 'DIWALI'])}{p} expires soon", f"New arrivals just dropped 👟", f"Festive season deals from {b}",
        f"Free delivery on your next order", f"Hurry! Only a few hours left", f"Weekend special: extra {p}% cashback", f"Recommended for you", f"Don't miss out on these deals",
        f"{b} Newsletter — {pick(['October', 'This week'])}'s picks", f"Upgrade to Premium at {p}% off", f"Get {pick(['3 months', '1 month'])} free", f"Price drop alert on items you viewed",
        f"Your cart is waiting", f"Learn {pick(['Python', 'Data Science', 'UI design', 'AI'])} — {p}% off this week", f"Members only: early access sale",
    ])
    body = pick([
        f"Shop the {pick(['Big Billion Days', 'Great Indian Festival', 'End of Reason Sale', 'Diwali Dhamaka', 'Black Friday'])} with up to {p}% off on {pick(['fashion', 'electronics', 'beauty', 'home'])}. Use code SAVE{p}. Shop now >",
        f"Hi {pick(NAMES)}, we picked these just for you. Order now and get free delivery. Unsubscribe | View in browser",
        f"Treat yourself! Get {p}% off on your next order above {amt()}. Valid till midnight. T&C apply. To stop receiving these emails, unsubscribe here.",
        f"Exclusive for our members: extra cashback with select cards. Limited stock — grab yours before it's gone!",
        f"Complete your purchase and save {amt()}. Items in your cart are selling fast. Shop now.",
        f"This week's top deals: {pick(['headphones', 'sneakers', 'smartwatches', 'skincare'])} starting at {amt()}. Click to explore.",
        f"Enroll today and get lifetime access. Offer ends soon. You received this email because you subscribed to {b} updates.",
        f"Download the app and get {p}% off on your first order. Use code APP{p}.",
    ])
    return subj, body


def spam():
    n = pick(NAMES)
    subj = pick([
        "Your KYC is pending — account will be blocked", "URGENT: Electricity disconnection tonight", "Congratulations! You won a lucky draw", "Income tax refund approved",
        "Your parcel is on hold at customs", "Work from home — earn ₹5,000 daily", "Your account has been suspended", "Claim your prize now", "Final notice: unpaid toll",
        "You have (1) pending payment", "Loan approved without documents", "Investment opportunity: 300% returns", "Your SIM will be deactivated", "Dear winner",
        "Verify your account immediately or it will be closed", "Your Netflix payment failed — update now", "Get rich with crypto", "Hot singles near you",
        "Re: your invoice", "Microsoft account unusual activity — act now",
    ])
    body = pick([
        f"Dear customer, your KYC has expired. Update immediately at http://bit.ly/{code(6)} or your account will be blocked within 24 hours.",
        f"Dear {n}, your electricity will be disconnected tonight at 9:30 PM as your last month bill was not updated. Call officer 98{code(8)} immediately.",
        f"Congratulations! You have won {amt()} in our lucky draw. To claim, send your bank details and a processing fee of {amt()}.",
        f"Your income tax refund of {amt()} is approved. Submit your card details at http://incometax-refund.{pick(['in.net', 'xyz', 'top'])} to receive it.",
        f"Your parcel could not be delivered due to unpaid customs duty. Pay {amt()} here: http://{code(6)}.site to release it.",
        f"Earn {amt()} per day from home! No experience needed. Join our Telegram group now. Limited seats.",
        f"We noticed unusual activity. Your account is suspended. Verify your identity here: http://secure-login-{code(4)}.com within 12 hours.",
        f"Get instant loan of {amt()} at 0% interest, no CIBIL check. Apply now: http://tinyurl.com/{code(6)}",
        f"Double your money in 7 days with our crypto trading bot. Guaranteed returns! Reply YES to start.",
        f"Your payment failed. Update your billing information now to avoid suspension: http://{code(6)}-billing.online",
        "I am a barrister and your late relative left US$ 10.5 million. Reply with your full name, address and phone number to claim.",
    ])
    return subj, body


GEN = {"important": important, "genuine": genuine, "promo": promo, "spam": spam}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "synthetic.csv"
    counts = {"important": 6000, "genuine": 9000, "promo": 7000, "spam": 5000}
    seen = set()
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["subject", "body", "label"])
        for label, n in counts.items():
            made = tries = 0
            while made < n and tries < n * 20:
                tries += 1
                s, b = GEN[label]()
                if (s, b) in seen:
                    continue
                seen.add((s, b)); w.writerow([s, b, label]); made += 1
            print(label, made)
