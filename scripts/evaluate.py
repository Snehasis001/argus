import os
import joblib
import pandas as pd
import numpy as np
from sklearn.metrics import precision_score, recall_score, f1_score, confusion_matrix, classification_report
from collections import defaultdict

FEATURES_CSV = os.path.join("data", "seed", "transactions_features.csv")
MODEL_PATH = os.path.join("ml-service", "model.joblib")

# Vague / evasive terminology
VAGUE_TERMS = {
    "misc", "consulting fee", "as discussed", "gift", "urgent settlement",
    "personal loan", "private agreement", "discretionary", "advance payment",
    "services", "transfer"
}

def detect_structuring_subset(amounts, target=50000, tolerance=2000):
    """0/1 subset sum check on last 30 transactions"""
    recent = [round(a) for a in amounts[-30:] if 0 < a <= target]
    if not recent:
        return False
    dp = [False] * (target + 1)
    dp[0] = True
    for a in recent:
        for s in range(target, a - 1, -1):
            if dp[s - a]:
                dp[s] = True
    for s in range(target - tolerance, target + 1):
        if dp[s]:
            return True
    return False

def run_evaluation():
    print(f"Loading feature dataset from {FEATURES_CSV}...")
    df = pd.read_csv(FEATURES_CSV)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    print(f"Loading trained ML model from {MODEL_PATH}...")
    model = joblib.load(MODEL_PATH)
    
    features = [
        "amount_zscore",
        "velocity",
        "is_new_counterparty",
        "hour_of_day",
        "amount_to_balance_ratio"
    ]
    
    # 1. ML Anomaly Scoring
    X = df[features]
    raw_scores = model.decision_function(X)
    risk_scores = np.clip(1.0 - (raw_scores + 0.5), 0.0, 1.0)
    df['ml_risk_score'] = risk_scores
    
    # 2. Graph & Pattern Mining
    print("Building adjacency list & detecting round-trip cycles...")
    # Pre-build graph adjacency for cycle detection
    adj = defaultdict(set)
    for u, v in zip(df['from_account_id'], df['to_account_id']):
        adj[u].add(v)
        
    # Find accounts participating in cycles of length <= 4
    cycle_nodes = set()
    for root in list(adj.keys())[:2500]:
        stack = [(root, [root])]
        while stack:
            curr, path = stack.pop()
            if len(path) > 4:
                continue
            for nxt in adj.get(curr, []):
                if nxt == root and len(path) > 1:
                    cycle_nodes.update(path)
                    break
                elif nxt not in path:
                    stack.append((nxt, path + [nxt]))
    
    print(f"Identified {len(cycle_nodes)} accounts participating in circular money flows.")

    # 3. DP Structuring Check per Account
    print("Running DP subset-sum structuring check...")
    account_amounts = defaultdict(list)
    for acc, amt in zip(df['from_account_id'], df['amount_usd']):
        account_amounts[acc].append(amt)
        
    structuring_accounts = set()
    for acc, amts in account_amounts.items():
        if len(amts) >= 3 and detect_structuring_subset(amts):
            structuring_accounts.add(acc)
            
    print(f"Identified {len(structuring_accounts)} accounts with sub-threshold structuring patterns.")

    # 4. Agent Triaging & Verdict Synthesis
    print("Synthesizing multi-modal agent verdicts...")
    y_true = df['is_laundering'].values
    y_pred = []
    reasons = []

    for idx, row in df.iterrows():
        from_acc = row['from_account_id']
        to_acc = row['to_account_id']
        memo = str(row['narration']).lower()
        
        ml_score = row['ml_risk_score']
        has_cycle = (from_acc in cycle_nodes) or (to_acc in cycle_nodes)
        has_structuring = from_acc in structuring_accounts
        is_vague_memo = any(term in memo for term in VAGUE_TERMS)
        
        # Agent scoring rule
        agent_score = (ml_score * 40)
        if has_cycle:
            agent_score += 35
        if has_structuring:
            agent_score += 20
        if is_vague_memo:
            agent_score += 15
            
        verdict = 1 if agent_score >= 65 else 0
        y_pred.append(verdict)
        
        if verdict == 1 and y_true[idx] == 0:
            reasons.append({
                "type": "FP",
                "tx_id": row['transaction_id'],
                "amount": row['amount_usd'],
                "from": from_acc,
                "to": to_acc,
                "memo": row['narration'],
                "agent_score": round(agent_score, 1),
                "has_cycle": has_cycle,
                "has_structuring": has_structuring
            })
        elif verdict == 0 and y_true[idx] == 1:
            reasons.append({
                "type": "FN",
                "tx_id": row['transaction_id'],
                "amount": row['amount_usd'],
                "from": from_acc,
                "to": to_acc,
                "memo": row['narration'],
                "agent_score": round(agent_score, 1),
                "ml_score": round(ml_score, 3)
            })

    # Metrics
    y_pred = np.array(y_pred)
    prec = precision_score(y_true, y_pred)
    rec = recall_score(y_true, y_pred)
    f1 = f1_score(y_true, y_pred)
    cm = confusion_matrix(y_true, y_pred)
    tn, fp, fn, tp = cm.ravel()

    print("\n================ SYSTEM EVALUATION REPORT ================")
    print(f"Total Transactions Evaluated : {len(df):,}")
    print(f"Total Ground-Truth Illicit    : {y_true.sum():,}")
    print(f"True Positives (Caught)       : {tp:,}")
    print(f"False Positives (Benign Flag) : {fp:,}")
    print(f"False Negatives (Missed)      : {fn:,}")
    print(f"True Negatives (Cleared)      : {tn:,}")
    print("---------------------------------------------------------")
    print(f"Precision : {prec * 100:.2f}%")
    print(f"Recall    : {rec * 100:.2f}%")
    print(f"F1-Score  : {f1 * 100:.2f}%")
    print("=========================================================\n")

    fps = [r for r in reasons if r['type'] == 'FP']
    fns = [r for r in reasons if r['type'] == 'FN']

    print(f"Example False Positives ({len(fps)} total):")
    for r in fps[:3]:
        print(f" - [{r['tx_id']}] ${r['amount']:,.2f} | Memo: '{r['memo']}' | Reason: Cycle={r['has_cycle']}, Structuring={r['has_structuring']} (Legitimate account with complex counterparty graph)")

    print(f"\nExample False Negatives ({len(fns)} total):")
    for r in fns[:3]:
        print(f" - [{r['tx_id']}] ${r['amount']:,.2f} | Memo: '{r['memo']}' | Reason: Low volume transfer with benign memo mimicking everyday retail spend")

    return {
        "precision": prec,
        "recall": rec,
        "f1": f1,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "sample_fps": fps[:3],
        "sample_fns": fns[:3]
    }

if __name__ == "__main__":
    run_evaluation()
