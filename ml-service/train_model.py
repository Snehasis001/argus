import os
import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib

def train():
    # Resolve paths relative to this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_path = os.path.join(script_dir, "..", "data", "seed", "transactions_features.csv")
    if not os.path.exists(data_path):
        data_path = os.path.join("data", "seed", "transactions_features.csv")
    
    model_path = os.path.join(script_dir, "model.joblib")

    print(f"Loading features from {data_path}...")
    df = pd.read_csv(data_path)
    features = [
        "amount_zscore",
        "velocity",
        "is_new_counterparty",
        "hour_of_day",
        "amount_to_balance_ratio"
    ]
    X = df[features]

    print(f"Fitting IsolationForest (n_estimators=150, contamination=0.05, random_state=42)...")
    # Isolation Forest is unsupervised — it does not use ground-truth laundering labels.
    # It learns normative baselines and flags multivariate spatial outliers.
    model = IsolationForest(n_estimators=150, contamination=0.05, random_state=42)
    model.fit(X)

    print(f"Saving model artifact to {model_path}...")
    joblib.dump(model, model_path)
    print("Model successfully trained and saved!")

if __name__ == "__main__":
    train()
